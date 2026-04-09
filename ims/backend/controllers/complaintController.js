const Complaint = require('../models/Complaint');
const { emitNotification, createRoleBasedNotifications } = require('../utils/notifications');

// Get all complaints
exports.getAll = async (req, res) => {
  try {
    const query = req.user.role === 'ADMIN' || req.user.role === 'CHECKER' 
      ? {} 
      : { createdBy: req.user._id };
    
    const complaints = await Complaint.find(query)
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName')
      .populate('createdBy', 'name role')
      .populate('resolvedBy', 'name')
      .populate('closedBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json({ complaints });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get single complaint
exports.getOne = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName')
      .populate('createdBy', 'name role')
      .populate('resolvedBy', 'name')
      .populate('closedBy', 'name')
      .populate('comments.createdBy', 'name role');
    
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
    
    // Check access
    if (req.user.role === 'MAKER' && complaint.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    res.json({ complaint });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create complaint (Maker only)
exports.create = async (req, res) => {
  try {
    const { title, description, investor, security } = req.body;
    
    const complaint = await Complaint.create({
      title,
      description,
      investor: investor || null,
      security: security || null,
      createdBy: req.user._id
    });
    
    await complaint.populate('investor', 'fullName folioNumber');
    await complaint.populate('security', 'isin companyName');
    await complaint.populate('createdBy', 'name role');
    
    // Notification: Complaint Raised → All (Maker + Checker + Admin)
    await createRoleBasedNotifications({
      req,
      event: 'COMPLAINT_RAISED',
      message: `New complaint "${title}" raised by ${req.user.fullName || req.user.email}`,
      entityType: 'Complaint',
      entityId: complaint._id,
      targetRoles: ['MAKER', 'CHECKER', 'ADMIN']
    });
    
    res.status(201).json({ complaint, message: 'Complaint created successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Resolve complaint (Checker/Admin)
exports.resolve = async (req, res) => {
  try {
    const { resolution } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
    if (complaint.status !== 'PENDING') return res.status(400).json({ message: 'Complaint already resolved or closed' });
    
    complaint.status = 'RESOLVED';
    complaint.resolution = resolution;
    complaint.resolvedBy = req.user._id;
    complaint.resolvedAt = new Date();
    await complaint.save();
    
    // Notify Maker
    await emitNotification('COMPLAINT_RAISED', {
      title: 'Complaint Resolved',
      message: `Your complaint "${complaint.title}" was resolved by ${req.user.fullName || req.user.email}`,
      entityId: complaint._id,
      entityType: 'Complaint',
      createdBy: req.user._id,
      createdByName: req.user.fullName || req.user.email,
      link: `/app/complaints`
    }, [complaint.createdBy]);
    
    res.json({ complaint, message: 'Complaint resolved' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Close complaint (Admin only)
exports.close = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
    
    complaint.status = 'CLOSED';
    complaint.closedBy = req.user._id;
    complaint.closedAt = new Date();
    await complaint.save();
    
    res.json({ complaint, message: 'Complaint closed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Add comment
exports.addComment = async (req, res) => {
  try {
    const { text } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
    if (complaint.status === 'CLOSED') return res.status(400).json({ message: 'Cannot comment on closed complaint' });
    
    complaint.comments.push({
      text,
      createdBy: req.user._id
    });
    await complaint.save();
    
    res.json({ complaint, message: 'Comment added' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
