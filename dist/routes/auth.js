"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supabase_js_1 = require("../lib/supabase.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
if (!process.env.JWT_SECRET) {
    console.warn('Warning: JWT_SECRET is not set. Tokens cannot be signed without it.');
}
const AUTH_TABLES = [
    { table: 'admin_staff', role: 'admin', idColumn: 'staffID', firstNameColumn: 'staffFirstName', lastNameColumn: 'staffLastName' },
    { table: 'tutor', role: 'tutor', idColumn: 'tutorID', firstNameColumn: 'tutorFirstName', lastNameColumn: 'tutorLastName' },
    { table: 'student', role: 'student', idColumn: 'studentID', firstNameColumn: 'stuFirstName', lastNameColumn: 'stuLastName' },
    { table: 'parent', role: 'parent', idColumn: 'parentID', firstNameColumn: 'parentFirstName', lastNameColumn: 'parentLastName' },
];
async function findUserByEmail(email) {
    for (const config of AUTH_TABLES) {
        const { data, error } = await supabase_js_1.supabase
            .from(config.table)
            .select('*')
            .eq('email', email)
            .single();
        if (data) {
            return { config, record: data };
        }
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
    }
    return null;
}
async function updatePasswordByEmail(email, passwordHash) {
    for (const config of AUTH_TABLES) {
        const { data, error } = await supabase_js_1.supabase
            .from(config.table)
            .update({ encrypted_password: passwordHash })
            .eq('email', email)
            .select(config.idColumn)
            .single();
        if (data) {
            return { config, record: data };
        }
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
    }
    return null;
}
function getPasswordValue(record) {
    const encryptedPassword = record.encrypted_password;
    const passwordHash = record.password_hash;
    if (typeof encryptedPassword === 'string') {
        return encryptedPassword;
    }
    if (typeof passwordHash === 'string') {
        return passwordHash;
    }
    return null;
}
function getTableConfigByRole(role) {
    return AUTH_TABLES.find((item) => item.role === role) || null;
}
// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }
        const lookup = await findUserByEmail(email.toLowerCase());
        if (!lookup) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        const { config, record } = lookup;
        const passwordValue = getPasswordValue(record);
        if (!passwordValue) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        const passwordMatch = await bcryptjs_1.default.compare(password, passwordValue);
        if (!passwordMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        const profileId = Number(record[config.idColumn] ?? 0);
        const firstName = String(record[config.firstNameColumn] ?? '');
        const lastName = String(record[config.lastNameColumn] ?? '');
        const payload = {
            userId: String(profileId || record[config.idColumn] || email.toLowerCase()),
            email: String(record.email ?? email.toLowerCase()),
            role: config.role,
            profileId,
        };
        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET not set when attempting to sign token');
            return res.status(500).json({ success: false, error: 'JWT_SECRET not set' });
        }
        const token = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
        return res.json({
            success: true,
            data: {
                token,
                user: {
                    id: String(profileId || record[config.idColumn] || email.toLowerCase()),
                    email: String(record.email ?? email.toLowerCase()),
                    role: config.role,
                    firstName,
                    lastName,
                    profileId,
                },
            },
        });
    }
    catch (err) {
        console.error(err);
        const devMessage = process.env.NODE_ENV === 'production' ? 'Server error' : (err?.message || String(err));
        return res.status(500).json({ success: false, error: devMessage });
    }
});
// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }
        const normalizedEmail = String(email).toLowerCase().trim();
        const existing = await findUserByEmail(normalizedEmail);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'No account found for that email' });
        }
        const temporaryPassword = (0, crypto_1.randomBytes)(4).toString('hex');
        const passwordHash = await bcryptjs_1.default.hash(temporaryPassword, 12);
        const updated = await updatePasswordByEmail(normalizedEmail, passwordHash);
        if (!updated) {
            return res.status(500).json({ success: false, error: 'Unable to reset password' });
        }
        return res.json({
            success: true,
            message: 'Password reset successfully',
            data: { temporaryPassword },
        });
    }
    catch (err) {
        console.error(err);
        const devMessage = process.env.NODE_ENV === 'production' ? 'Server error' : (err?.message || String(err));
        return res.status(500).json({ success: false, error: devMessage });
    }
});
// POST /api/auth/change-password
router.post('/change-password', auth_js_1.authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, error: 'Current password and new password are required' });
        }
        if (String(newPassword).length < 8) {
            return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long' });
        }
        const tableConfig = getTableConfigByRole(req.user.role);
        if (!tableConfig) {
            return res.status(400).json({ success: false, error: 'Invalid account role' });
        }
        const { data: record, error: fetchError } = await supabase_js_1.supabase
            .from(tableConfig.table)
            .select('*')
            .eq(tableConfig.idColumn, req.user.profileId)
            .single();
        if (fetchError || !record) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }
        const passwordValue = getPasswordValue(record);
        if (!passwordValue) {
            return res.status(500).json({ success: false, error: 'Stored password not found' });
        }
        const passwordMatch = await bcryptjs_1.default.compare(String(currentPassword), passwordValue);
        if (!passwordMatch) {
            return res.status(400).json({ success: false, error: 'Current password is incorrect' });
        }
        const passwordHash = await bcryptjs_1.default.hash(String(newPassword), 12);
        const { error: updateError } = await supabase_js_1.supabase
            .from(tableConfig.table)
            .update({ encrypted_password: passwordHash })
            .eq(tableConfig.idColumn, req.user.profileId);
        if (updateError) {
            throw updateError;
        }
        return res.json({ success: true, message: 'Password updated successfully' });
    }
    catch (err) {
        console.error(err);
        const devMessage = process.env.NODE_ENV === 'production' ? 'Server error' : (err?.message || String(err));
        return res.status(500).json({ success: false, error: devMessage });
    }
});
// POST /api/auth/register (admin only in production, open for setup)
router.post('/register', async (req, res) => {
    try {
        const { email, password, role, firstName, lastName } = req.body;
        if (!email || !password || !role || !firstName || !lastName) {
            return res.status(400).json({ success: false, error: 'All fields required' });
        }
        const validRoles = ['admin', 'tutor', 'student', 'parent'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }
        const existing = await findUserByEmail(email.toLowerCase());
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const tableConfig = AUTH_TABLES.find((item) => item.role === role);
        if (!tableConfig) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }
        const insertPayload = {
            email: email.toLowerCase(),
            encrypted_password: passwordHash,
        };
        insertPayload[tableConfig.firstNameColumn] = firstName;
        insertPayload[tableConfig.lastNameColumn] = lastName;
        if (role === 'admin') {
            insertPayload.role = 'admin';
        }
        if (role === 'student') {
            insertPayload.stuContactInfo = '';
            insertPayload.address = '';
            insertPayload.status = 'active';
        }
        if (role === 'tutor') {
            insertPayload.specialization = '';
        }
        if (role === 'parent') {
            insertPayload.contactInfo = '';
            insertPayload.relationship = 'parent';
        }
        const { data: createdRecord, error: uErr } = await supabase_js_1.supabase
            .from(tableConfig.table)
            .insert(insertPayload)
            .select('*')
            .single();
        if (uErr)
            throw uErr;
        const created = createdRecord;
        const profileId = Number(created[tableConfig.idColumn] ?? 0);
        return res.status(201).json({
            success: true,
            data: {
                user: {
                    id: String(profileId || created[tableConfig.idColumn] || email.toLowerCase()),
                    email: String(created.email ?? email.toLowerCase()),
                    role,
                    firstName: String(created[tableConfig.firstNameColumn] ?? firstName),
                    lastName: String(created[tableConfig.lastNameColumn] ?? lastName),
                    profileId,
                },
            },
            message: 'Registration successful',
        });
    }
    catch (err) {
        console.error(err);
        const devMessage = process.env.NODE_ENV === 'production' ? 'Server error' : (err?.message || String(err));
        return res.status(500).json({ success: false, error: devMessage });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map