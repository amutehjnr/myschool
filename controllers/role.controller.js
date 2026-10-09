'use strict';

const roleRepo = require('../repositories/role.repository');
const auditRepo = require('../repositories/audit.repository');

async function list(req, res, next) {
  try {
    const roles = await roleRepo.listRoles();
    res.render('admin/roles/list', {
      title: 'Roles & Permissions',
      roles
    });
  } catch (err) {
    next(err);
  }
}

async function showEdit(req, res, next) {
  try {
    const role = await roleRepo.findById(req.params.id);
    if (!role) {
      req.session.flash = { type: 'error', message: 'Role not found.' };
      return res.redirect('/admin/roles');
    }
    const permissions = await roleRepo.listAllPermissions();
    const rolePerms = await roleRepo.getPermissions(role.id);
    const rolePermIds = new Set(rolePerms.map((p) => p.id));

    // Group permissions by module
    const grouped = {};
    for (const p of permissions) {
      const mod = p.module || 'general';
      if (!grouped[mod]) grouped[mod] = [];
      grouped[mod].push({ ...p, assigned: rolePermIds.has(p.id) });
    }

    res.render('admin/roles/edit', {
      title: `Permissions — ${role.name}`,
      role,
      grouped
    });
  } catch (err) {
    next(err);
  }
}

async function updatePermissions(req, res, next) {
  try {
    const role = await roleRepo.findById(req.params.id);
    if (!role) {
      req.session.flash = { type: 'error', message: 'Role not found.' };
      return res.redirect('/admin/roles');
    }

    // Never allow editing the administrator role's core access away carelessly —
    // still allow updates but audit them.
    let permissionIds = req.body.permissions || [];
    if (!Array.isArray(permissionIds)) {
      permissionIds = [permissionIds];
    }
    permissionIds = permissionIds.map((id) => Number(id)).filter(Boolean);

    await roleRepo.setRolePermissions(role.id, permissionIds);

    await auditRepo.create({
      userId: req.session.userId,
      action: 'PERMISSION_CHANGED',
      module: 'roles',
      recordId: role.id,
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { role: role.name, permissionCount: permissionIds.length }
    });

    req.session.flash = { type: 'success', message: 'Permissions updated.' };
    res.redirect('/admin/roles');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  showEdit,
  updatePermissions
};
