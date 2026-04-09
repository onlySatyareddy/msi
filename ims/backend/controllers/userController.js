const User = require('../models/User');

exports.getAll = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email, password required' });
    if (await User.findOne({ email })) return res.status(409).json({ message: 'Email taken' });
    const user = await User.create({ name, email, password, role: role || 'MAKER' });
    res.status(201).json({ message: 'User created', user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.status = req.body.status;
    await user.save();
    res.json({ message: 'User status updated', user });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
