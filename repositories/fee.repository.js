'use strict';

const { query } = require('../config/database');

// ---------- Categories & fee definitions ----------

async function listCategories() {
  return query(`SELECT id, name, description, is_active FROM fee_categories ORDER BY name`);
}

async function listFees({ activeOnly = true } = {}) {
  let where = '1=1';
  if (activeOnly) where += ' AND f.is_active = 1';
  return query(
    `SELECT f.*, fc.name AS category_name, c.name AS class_name
     FROM fees f
     JOIN fee_categories fc ON fc.id = f.fee_category_id
     LEFT JOIN classes c ON c.id = f.class_id
     WHERE ${where}
     ORDER BY fc.name, f.name`
  );
}

async function findFeeById(id) {
  const rows = await query(
    `SELECT f.*, fc.name AS category_name
     FROM fees f
     JOIN fee_categories fc ON fc.id = f.fee_category_id
     WHERE f.id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function createFee(data) {
  const result = await query(
    `INSERT INTO fees
       (fee_category_id, name, amount, class_id, academic_session_id, term_id, due_date, is_active)
     VALUES
       (:categoryId, :name, :amount, :classId, :sessionId, :termId, :dueDate, 1)`,
    {
      categoryId: data.categoryId,
      name: data.name,
      amount: data.amount,
      classId: data.classId || null,
      sessionId: data.sessionId || null,
      termId: data.termId || null,
      dueDate: data.dueDate || null
    }
  );
  return result.insertId;
}

// ---------- Student fees (bills) ----------

async function assignFeeToStudent({
  studentId,
  feeId,
  amountDue,
  dueDate = null,
  sessionId = null,
  termId = null
}) {
  const result = await query(
    `INSERT INTO student_fees
       (student_id, fee_id, amount_due, amount_paid, status, due_date, academic_session_id, term_id)
     VALUES
       (:studentId, :feeId, :amountDue, 0, 'outstanding', :dueDate, :sessionId, :termId)
     ON DUPLICATE KEY UPDATE
       amount_due = VALUES(amount_due),
       due_date = COALESCE(VALUES(due_date), due_date)`,
    { studentId, feeId, amountDue, dueDate, sessionId, termId }
  );
  return result.insertId || result.affectedRows;
}

async function listStudentFees({
  studentId = null,
  status = null,
  classId = null,
  page = 1,
  limit = 30
} = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };

  if (studentId) {
    where += ' AND sf.student_id = :studentId';
    params.studentId = studentId;
  }
  if (status) {
    where += ' AND sf.status = :status';
    params.status = status;
  }
  if (classId) {
    where += ' AND s.class_id = :classId';
    params.classId = classId;
  }

  const rows = await query(
    `SELECT sf.*, f.name AS fee_name, fc.name AS category_name,
            s.student_id AS student_code, s.first_name, s.last_name, s.class_id,
            c.name AS class_name
     FROM student_fees sf
     JOIN fees f ON f.id = sf.fee_id
     JOIN fee_categories fc ON fc.id = f.fee_category_id
     JOIN students s ON s.id = sf.student_id
     LEFT JOIN classes c ON c.id = s.class_id
     WHERE ${where}
     ORDER BY sf.due_date IS NULL, sf.due_date, s.last_name
     LIMIT :limit OFFSET :offset`,
    params
  );

  const [countRow] = await query(
    `SELECT COUNT(*) AS total
     FROM student_fees sf
     JOIN students s ON s.id = sf.student_id
     WHERE ${where}`,
    params
  );

  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

async function findStudentFeeById(id) {
  const rows = await query(
    `SELECT sf.*, f.name AS fee_name, fc.name AS category_name,
            s.student_id AS student_code, s.first_name, s.last_name, s.class_id
     FROM student_fees sf
     JOIN fees f ON f.id = sf.fee_id
     JOIN fee_categories fc ON fc.id = f.fee_category_id
     JOIN students s ON s.id = sf.student_id
     WHERE sf.id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function updateStudentFeeAmounts(id, { amountPaid, status }) {
  await query(
    `UPDATE student_fees SET amount_paid = :amountPaid, status = :status WHERE id = :id`,
    { id, amountPaid, status }
  );
}

// ---------- Payments & receipts ----------

function generatePaymentRef() {
  const y = new Date().getFullYear();
  const r = Math.floor(100000 + Math.random() * 900000);
  return `PSHA-PAY-${y}-${r}`;
}

function generateReceiptNumber() {
  const y = new Date().getFullYear();
  const r = Math.floor(100000 + Math.random() * 900000);
  return `PSHA-RCP-${y}-${r}`;
}

async function createPayment(data) {
  let ref = data.paymentReference || generatePaymentRef();
  for (let i = 0; i < 5; i++) {
    const existing = await query(
      `SELECT id FROM payments WHERE payment_reference = :ref LIMIT 1`,
      { ref }
    );
    if (!existing.length) break;
    ref = generatePaymentRef();
  }

  const result = await query(
    `INSERT INTO payments
       (student_fee_id, student_id, amount, payment_method, payment_reference,
        status, recorded_by, notes, paid_at)
     VALUES
       (:studentFeeId, :studentId, :amount, :method, :ref,
        'completed', :recordedBy, :notes, COALESCE(:paidAt, NOW()))`,
    {
      studentFeeId: data.studentFeeId,
      studentId: data.studentId,
      amount: data.amount,
      method: data.paymentMethod || 'cash',
      ref,
      recordedBy: data.recordedBy || null,
      notes: data.notes || null,
      paidAt: data.paidAt || null
    }
  );
  return { id: result.insertId, paymentReference: ref };
}

async function createReceipt(paymentId, issuedBy) {
  let number = generateReceiptNumber();
  for (let i = 0; i < 5; i++) {
    const existing = await query(
      `SELECT id FROM payment_receipts WHERE receipt_number = :n LIMIT 1`,
      { n: number }
    );
    if (!existing.length) break;
    number = generateReceiptNumber();
  }
  const result = await query(
    `INSERT INTO payment_receipts (payment_id, receipt_number, issued_by)
     VALUES (:paymentId, :number, :issuedBy)`,
    { paymentId, number, issuedBy }
  );
  return { id: result.insertId, receiptNumber: number };
}

async function getPayment(id) {
  const rows = await query(
    `SELECT p.*, pr.receipt_number, pr.issued_at,
            s.student_id AS student_code, s.first_name, s.last_name,
            f.name AS fee_name
     FROM payments p
     JOIN students s ON s.id = p.student_id
     JOIN student_fees sf ON sf.id = p.student_fee_id
     JOIN fees f ON f.id = sf.fee_id
     LEFT JOIN payment_receipts pr ON pr.payment_id = p.id
     WHERE p.id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function listPayments({ studentId = null, page = 1, limit = 30 } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  let where = '1=1';
  const params = { limit: Number(limit), offset };
  if (studentId) {
    where += ' AND p.student_id = :studentId';
    params.studentId = studentId;
  }
  const rows = await query(
    `SELECT p.id, p.amount, p.payment_method, p.payment_reference, p.status, p.paid_at,
            pr.receipt_number,
            s.student_id AS student_code, s.first_name, s.last_name,
            f.name AS fee_name
     FROM payments p
     JOIN students s ON s.id = p.student_id
     JOIN student_fees sf ON sf.id = p.student_fee_id
     JOIN fees f ON f.id = sf.fee_id
     LEFT JOIN payment_receipts pr ON pr.payment_id = p.id
     WHERE ${where}
     ORDER BY p.paid_at DESC
     LIMIT :limit OFFSET :offset`,
    params
  );
  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM payments p WHERE ${where}`,
    params
  );
  return { rows, total: countRow?.total || 0, page: Number(page), limit: Number(limit) };
}

async function sumOutstanding() {
  const rows = await query(
    `SELECT COALESCE(SUM(amount_due - amount_paid), 0) AS total
     FROM student_fees
     WHERE status IN ('outstanding','partially_paid')`
  );
  return rows[0]?.total || 0;
}

module.exports = {
  listCategories,
  listFees,
  findFeeById,
  createFee,
  assignFeeToStudent,
  listStudentFees,
  findStudentFeeById,
  updateStudentFeeAmounts,
  createPayment,
  createReceipt,
  getPayment,
  listPayments,
  sumOutstanding
};
