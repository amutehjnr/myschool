'use strict';

const feeService = require('../services/fee.service');
const studentService = require('../services/student.service');
const parentService = require('../services/parent.service');
const { paginate, formatDate, statusBadgeClass } = require('../utils/helpers');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

// ---------- Admin ----------

async function adminListFees(req, res, next) {
  try {
    const fees = await feeService.listFeeDefinitions();
    res.render('admin/fees/list', {
      title: 'Fee Definitions',
      fees,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

async function adminShowCreateFee(req, res, next) {
  try {
    const categories = await feeService.listCategories();
    const classes = await feeService.listClasses();
    res.render('admin/fees/form', {
      title: 'New Fee',
      categories,
      classes,
      fee: null
    });
  } catch (err) {
    next(err);
  }
}

async function adminCreateFee(req, res, next) {
  try {
    const categories = await feeService.listCategories();
    const classes = await feeService.listClasses();
    const result = await feeService.createFeeDefinition(
      {
        name: req.body.name,
        categoryId: Number(req.body.category_id),
        amount: req.body.amount,
        classId: req.body.class_id ? Number(req.body.class_id) : null,
        dueDate: req.body.due_date || null
      },
      req.session.userId,
      meta(req)
    );
    if (result.error) {
      return res.status(400).render('admin/fees/form', {
        title: 'New Fee',
        categories,
        classes,
        fee: req.body,
        error: result.error
      });
    }
    req.session.flash = { type: 'success', message: 'Fee definition created.' };
    res.redirect('/admin/fees');
  } catch (err) {
    next(err);
  }
}

async function adminListBills(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, 30);
    const result = await feeService.listBills({
      page,
      limit,
      status: req.query.status || null,
      classId: req.query.class_id || null
    });
    const classes = await feeService.listClasses();
    const totalPages = Math.ceil(result.total / result.limit) || 1;
    res.render('admin/fees/bills', {
      title: 'Student Bills',
      bills: result.rows,
      page: result.page,
      totalPages,
      total: result.total,
      classes,
      filters: {
        status: req.query.status || '',
        class_id: req.query.class_id || ''
      },
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function adminShowAssign(req, res, next) {
  try {
    const fees = await feeService.listFeeDefinitions();
    const classes = await feeService.listClasses();
    const students = await feeService.listStudentsForSelect();
    res.render('admin/fees/assign', {
      title: 'Assign Fees',
      fees: fees.filter((f) => f.is_active),
      classes,
      students
    });
  } catch (err) {
    next(err);
  }
}

async function adminAssign(req, res, next) {
  try {
    const result = await feeService.assignFee(
      {
        feeId: Number(req.body.fee_id),
        classId: req.body.class_id ? Number(req.body.class_id) : null,
        studentId: req.body.student_id ? Number(req.body.student_id) : null,
        amountDue: req.body.amount_due ? Number(req.body.amount_due) : null,
        dueDate: req.body.due_date || null
      },
      req.session.userId,
      meta(req)
    );
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || `Assigned to ${result.assigned} student(s).`
    };
    res.redirect('/admin/fees/bills');
  } catch (err) {
    next(err);
  }
}

async function adminShowRecordPayment(req, res, next) {
  try {
    const bill = await feeService.getBill(req.params.id);
    if (!bill) {
      req.session.flash = { type: 'error', message: 'Bill not found.' };
      return res.redirect('/admin/fees/bills');
    }
    res.render('admin/fees/payment', {
      title: 'Record Payment',
      bill,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function adminRecordPayment(req, res, next) {
  try {
    const result = await feeService.recordPayment(
      {
        studentFeeId: Number(req.params.id),
        amount: req.body.amount,
        paymentMethod: req.body.payment_method,
        paymentReference: req.body.payment_reference || null,
        notes: req.body.notes || null
      },
      req.session.userId,
      meta(req)
    );
    if (result.error) {
      const bill = await feeService.getBill(req.params.id);
      return res.status(400).render('admin/fees/payment', {
        title: 'Record Payment',
        bill,
        formatDate,
        statusBadgeClass,
        error: result.error
      });
    }
    req.session.flash = {
      type: 'success',
      message: `Payment recorded. Receipt: ${result.receiptNumber}`
    };
    res.redirect(`/admin/fees/payments/${result.paymentId}`);
  } catch (err) {
    next(err);
  }
}

async function adminListPayments(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, 30);
    const result = await feeService.listPayments({ page, limit });
    const totalPages = Math.ceil(result.total / result.limit) || 1;
    res.render('admin/fees/payments', {
      title: 'Payments',
      payments: result.rows,
      page: result.page,
      totalPages,
      total: result.total,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function adminShowPayment(req, res, next) {
  try {
    const payment = await feeService.getPayment(req.params.id);
    if (!payment) {
      req.session.flash = { type: 'error', message: 'Payment not found.' };
      return res.redirect('/admin/fees/payments');
    }
    res.render('admin/fees/receipt', {
      title: 'Receipt',
      payment,
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

// ---------- Parent / Student portal ----------

async function parentFees(req, res, next) {
  try {
    const childId = req.query.child || req.session.selectedChildId;
    const data = await parentService.getPortalData(req.session.userId, childId);
    if (!data || !data.selectedChild) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No child linked.'
      });
    }
    const auth = await feeService.getAuthorizedStudentFees(
      req.session.userId,
      req.session.role,
      data.selectedChild.id
    );
    if (auth.error) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: auth.error
      });
    }
    res.render('parent/fees', {
      title: 'Fees',
      ...data,
      fees: auth.fees,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

async function studentFees(req, res, next) {
  try {
    const student = await studentService.getStudentByUserId(req.session.userId);
    if (!student) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: 'No student profile linked.'
      });
    }
    const auth = await feeService.getAuthorizedStudentFees(
      req.session.userId,
      req.session.role,
      student.id
    );
    if (auth.error) {
      return res.status(403).render('errors/403', {
        title: 'Access Denied',
        message: auth.error
      });
    }
    res.render('student/fees', {
      title: 'My Fees',
      student,
      fees: auth.fees,
      formatDate,
      statusBadgeClass
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  adminListFees,
  adminShowCreateFee,
  adminCreateFee,
  adminListBills,
  adminShowAssign,
  adminAssign,
  adminShowRecordPayment,
  adminRecordPayment,
  adminListPayments,
  adminShowPayment,
  parentFees,
  studentFees
};
