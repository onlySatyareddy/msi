import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, Box } from '@mui/material';
import { Warning } from '@mui/icons-material';

export default function ConfirmDialog({ open, title, message, requireReason, requireResolution, onConfirm, onCancel, severity='warning' }) {
  const [reason, setReason] = useState('');
  const COLOR = { warning: '#e65100', error: '#c62828', success: '#2e7d32' };
  const needsReason = requireReason || requireResolution;

  const handleConfirm = () => {
    if (needsReason && !reason.trim()) return;
    onConfirm(reason);
    setReason('');
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: COLOR[severity] }}>
        <Warning /> {title}
      </DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" mb={2}>{message}</Typography>
        {needsReason && (
          <TextField
            fullWidth multiline rows={3} label={requireResolution ? "Resolution *" : "Reason *"}
            value={reason} onChange={e => setReason(e.target.value)}
            placeholder={requireResolution ? "Provide resolution details..." : "Provide a detailed reason..."}
            error={needsReason && !reason.trim()}
            helperText={needsReason && !reason.trim() ? (requireResolution ? 'Resolution is mandatory' : 'Reason is mandatory') : ''}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} variant="outlined">Cancel</Button>
        <Button onClick={handleConfirm} variant="contained"
          color={severity === 'error' ? 'error' : severity === 'success' ? 'success' : 'warning'}
          disabled={needsReason && !reason.trim()}>
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
