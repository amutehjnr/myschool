'use strict';

const feeRepo = require('../repositories/fee.repository');
const studentRepo = require('../repositories/student.repository');
const auditRepo = require('../repositories/audit.repository');
const academicRepo = require('../repositories/academic.repository');
const { query } = require('../config/database');

async function listFeeDefinitions() {
  return feeRepo.listFees({ activeOnly: false });
}

async function listCategories() {
  return feeRepo.listCategories();
}

async function createFeeDefinition(data, adminUserId, meta = {}) {
  if (!data.name || !data.categoryId || data.amount == null) {
    return { error: 'Name, category and amount are required.' };
  }
  const amount = Number(data.amount);
  if (Number.isNaN(amount) || amount < 0) {
    return { error: 'Amount must be a non-negative number.' };
  }
  const id = await feeRepo.createFee({
    categoryId: data.categoryId,
    name: data.name,
    amount,
    classId: data.classId || null,
    sessionId: data.sessionId || null,
    termId: data.termId || null,
    dueDate: data.dueDate || null
  });

  await auditRepo.create({
    userId: adminUserId,
    action: 'FEE_CREATED',
    module: 'fees',
    recordId: id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { name: data.name, amount }
  });

  return { success: true, id };
}

/**
 * Assign a fee to all active students in a class (or a single student).
 */
async function assignFee(data, adminUserId, meta = {}) {
  const fee = await feeRepo.findFeeById(data.feeId);
  if (!fee) return { error: 'Fee definition not found.' };

  let students = [];
  if (data.studentId) {
    const s = await studentRepo.findById(data.studentId);
    if (!s) return { error: 'Student not found.' };
    students = [s];
  } else if (data.classId) {
    students = await academicRepo.getStudentsInClass(data.classId);
  } else if (fee.class_id) {
    students = await academicRepo.getStudentsInClass(fee.class_id);
  } else {
    return { error: 'Specify a class or student to assign this fee.' };
  }

  const amountDue = data.amountDue != null ? Number(data.amountDue) : Number(fee.amount);
  let assigned = 0;

  for (const st of students) {
    await feeRepo.assignFeeToStudent({
      studentId: st.id,
      feeId: fee.id,
      amountDue,
      dueDate: data.dueDate || fee.due_date || null,
      sessionId: data.sessionId || fee.academic_session_id || null,
      termId: data.termId || fee.term_id || null
    });
    assigned += 1;
  }

  await auditRepo.create({
    userId: adminUserId,
    action: 'FEE_ASSIGNED',
    module: 'fees',
    recordId: fee.id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: { assigned, feeId: fee.id }
  });

  return { success: true, assigned };
}

async function listBills(filters) {
  return feeRepo.listStudentFees(filters);
}

async function getBill(id) {
  return feeRepo.findStudentFeeById(id);
}

/**
 * Record a payment against a student fee; updates balance and issues receipt.
 */
async function recordPayment(data, recordedBy, meta = {}) {
  const bill = await feeRepo.findStudentFeeById(data.studentFeeId);
  if (!bill) return { error: 'Bill not found.' };
  if (bill.status === 'waived' || bill.status === 'paid') {
    return { error: 'This bill is already fully settled or waived.' };
  }

  const amount = Number(data.amount);
  if (Number.isNaN(amount) || amount <= 0) {
    return { error: 'Payment amount must be greater than zero.' };
  }

  const remaining = Number(bill.amount_due) - Number(bill.amount_paid);
  if (amount > remaining + 0.001) {
    return { error: `Amount exceeds outstanding balance of ${remaining.toFixed(2)}.` };
  }

  const payment = await feeRepo.createPayment({
    studentFeeId: bill.id,
    studentId: bill.student_id,
    amount,
    paymentMethod: data.paymentMethod || 'cash',
    paymentReference: data.paymentReference || null,
    recordedBy,
    notes: data.notes || null,
    paidAt: data.paidAt || null
  });

  const newPaid = Number(bill.amount_paid) + amount;
  let status = 'partially_paid';
  if (newPaid >= Number(bill.amount_due) - 0.001) {
    status = 'paid';
  }

  await feeRepo.updateStudentFeeAmounts(bill.id, {
    amountPaid: Math.round(newPaid * 100) / 100,
    status
  });

  const receipt = await feeRepo.createReceipt(payment.id, recordedBy);

  await auditRepo.create({
    userId: recordedBy,
    action: 'PAYMENT_RECORDED',
    module: 'fees',
    recordId: payment.id,
    status: 'success',
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    metadata: {
      amount,
      studentFeeId: bill.id,
      receipt: receipt.receiptNumber
    }
  });

  return {
    success: true,
    paymentId: payment.id,
    paymentReference: payment.paymentReference,
    receiptNumber: receipt.receiptNumber
  };
}

async function getPayment(id) {
  return feeRepo.getPayment(id);
}

async function listPayments(filters) {
  return feeRepo.listPayments(filters);
}

async function getStudentFees(studentId) {
  const result = await feeRepo.listStudentFees({ studentId, limit: 100 });
  return result.rows;
}

/**
 * Parent/student portal: only own or linked child fees.
 */
async function getAuthorizedStudentFees(viewerUserId, viewerRole, studentId) {
  const role = String(viewerRole || '').toLowerCase();
  if (role === 'student') {
    const me = await studentRepo.findByUserId(viewerUserId);
    if (!me || Number(me.id) !== Number(studentId)) return { error: 'Access denied.' };
  } else if (role === 'parent') {
    const ok = await studentRepo.isChildOfParent(studentId, viewerUserId);
    if (!ok) return { error: 'Access denied.' };
  } else if (role !== 'administrator') {
    return { error: 'Access denied.' };
  }
  const fees = await getStudentFees(studentId);
  return { fees };
}

async function listClasses() {
  return query(`SELECT id, name FROM classes WHERE is_active = 1 ORDER BY name`);
}

async function listStudentsForSelect() {
  return query(
    `SELECT id, student_id, first_name, last_name FROM students WHERE status = 'active' ORDER BY last_name LIMIT 500`
  );
}

module.exports = {
  listFeeDefinitions,
  listCategories,
  createFeeDefinition,
  assignFee,
  listBills,
  getBill,
  recordPayment,
  getPayment,
  listPayments,
  getStudentFees,
  getAuthorizedStudentFees,
  listClasses,
  listStudentsForSelect
};
