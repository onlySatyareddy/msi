import React from 'react';
import { Chip } from '@mui/material';

const STATUS_CONFIG = {
  DRAFT:        { color: 'default',  label: 'Draft' },
  KYC_PENDING:  { color: 'info',     label: 'KYC Pending' },
  UNDER_REVIEW: { color: 'warning',  label: 'Under Review' },
  APPROVED:     { color: 'success',  label: 'Approved' },
  REJECTED:     { color: 'error',    label: 'Rejected' },
  PENDING:      { color: 'warning',  label: 'Pending' },
  INITIATED:    { color: 'info',     label: 'Initiated' },
  SUBMITTED:    { color: 'info',     label: 'Submitted' },
  EXECUTED:     { color: 'success',  label: 'Executed' },
  ACTIVE:       { color: 'success',  label: 'Active' },
  INACTIVE:     { color: 'default',  label: 'Inactive' },
  NOT_STARTED:  { color: 'default',  label: 'Not Started' },
  UPLOADED:     { color: 'info',     label: 'Uploaded' },
};

export default function StatusChip({ status, size = 'small' }) {
  const cfg = STATUS_CONFIG[status] || { color: 'default', label: status };
  return <Chip label={cfg.label} color={cfg.color} size={size} sx={{ fontWeight: 600, fontSize: '0.72rem' }} />;
}
