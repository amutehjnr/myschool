'use strict';

const userService = require('../services/user.service');
const roleRepo = require('../repositories/role.repository');
const { validationResult } = require('express-validator');
const { paginate, formatDate } = require('../utils/helpers');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

async function list(req, res, next) {
  try {
    const { page, limit } = paginate(req.query.page, req.query.limit || 20);
    const result = await userService.listUsers({
      page,
      limit,
      role: req.query.role || null,
      search: req.query.search || null,
      isActive: req.query.status === 'active' ? 1 : req.query.status === 'inactive' ? 0 : null
    });
    const roles = await roleRepo.listRoles();
    const totalPages = Math.ceil(result.total / result.limit) || 1;

    res.render('admin/users/list', {
      title: 'Users',
      users: result.rows,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages,
      roles,
      filters: {
        role: req.query.role || '',
        search: req.query.search || '',
        status: req.query.status || ''
      },
      formatDate
    });
  } catch (err) {
    next(err);
  }
}

async function showCreate(req, res, next) {
  try {
    const roles = await roleRepo.listRoles();
    res.render('admin/users/form', {
      title: 'Add User',
      user: null,
      roles,
      mode: 'create'
    });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const errors = validationResult(req);
    const roles = await roleRepo.listRoles();

    if (!errors.isEmpty()) {
      return res.status(400).render('admin/users/form', {
        title: 'Add User',
        user: req.body,
        roles,
        mode: 'create',
        error: errors.array()[0].msg
      });
    }

    const result = await userService.createUser(
      {
        email: req.body.email,
        roleId: Number(req.body.role_id),
        password: req.body.password || null
      },
      req.session.userId,
      meta(req)
    );

    if (result.error) {
      return res.status(400).render('admin/users/form', {
        title: 'Add User',
        user: req.body,
        roles,
        mode: 'create',
        error: result.error
      });
    }

    let msg = 'User created successfully.';
    if (result.temporaryPassword) {
      msg += ` Temporary password: ${result.temporaryPassword}`;
    }
    req.session.flash = { type: 'success', message: msg };
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
}

async function showEdit(req, res, next) {
  try {
    const user = await userService.getUser(req.params.id);
    if (!user) {
      req.session.flash = { type: 'error', message: 'User not found.' };
      return res.redirect('/admin/users');
    }
    const roles = await roleRepo.listRoles();
    res.render('admin/users/form', {
      title: 'Edit User',
      user,
      roles,
      mode: 'edit'
    });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const errors = validationResult(req);
    const roles = await roleRepo.listRoles();
    const user = await userService.getUser(req.params.id);

    if (!user) {
      req.session.flash = { type: 'error', message: 'User not found.' };
      return res.redirect('/admin/users');
    }

    if (!errors.isEmpty()) {
      return res.status(400).render('admin/users/form', {
        title: 'Edit User',
        user: { ...user, ...req.body },
        roles,
        mode: 'edit',
        error: errors.array()[0].msg
      });
    }

    const result = await userService.updateUser(
      req.params.id,
      { email: req.body.email, roleId: Number(req.body.role_id) },
      req.session.userId,
      meta(req)
    );

    if (result.error) {
      return res.status(400).render('admin/users/form', {
        title: 'Edit User',
        user: { ...user, ...req.body },
        roles,
        mode: 'edit',
        error: result.error
      });
    }

    req.session.flash = { type: 'success', message: 'User updated.' };
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
}

async function activate(req, res, next) {
  try {
    const result = await userService.activateUser(req.params.id, req.session.userId, meta(req));
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'User activated.'
    };
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
}

async function deactivate(req, res, next) {
  try {
    const result = await userService.deactivateUser(req.params.id, req.session.userId, meta(req));
    req.session.flash = {
      type: result.error ? 'error' : 'success',
      message: result.error || 'User deactivated.'
    };
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const result = await userService.adminResetPassword(req.params.id, req.session.userId, meta(req));
    if (result.error) {
      req.session.flash = { type: 'error', message: result.error };
    } else {
      req.session.flash = {
        type: 'success',
        message: `Password reset. Temporary password: ${result.temporaryPassword}`
      };
    }
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  showCreate,
  create,
  showEdit,
  update,
  activate,
  deactivate,
  resetPassword
};
