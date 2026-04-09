# 🏦 Investor Management System (IMS)
## Production-Grade Maker–Checker–Admin Workflow

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 16
- MongoDB running locally (or set MONGO_URI in .env)

### Backend Setup
```bash
cd backend
npm install
node utils/seed.js     # Creates default users
npm start              # Starts on :5000
```

### Frontend Setup
```bash
cd frontend
npm install
npm start              # Starts on :3000
```

---

## 🔑 Default Login Credentials (after seed)

| Role    | Email               | Password     |
|---------|---------------------|--------------|
| ADMIN   | admin@ims.com       | Admin@123    |
| CHECKER | checker@ims.com     | Checker@123  |
| MAKER   | maker@ims.com       | Maker@123    |

---

## 👥 Role Permissions

### MAKER
- Create investor (DRAFT)
- Upload KYC: Aadhaar, PAN, Bank Passbook, Photo
- Submit for review
- Edit DRAFT/REJECTED investors
- Initiate & submit share transfers
- Create allocations

### CHECKER
- Review & approve/reject investors (mandatory reason for rejection)
- Approve/reject securities, allocations, transfers
- View audit logs & status history

### ADMIN
- Full access to all operations
- Manage users
- Override approvals
- View full system history

---

## 📋 Complete Workflow

### Investor Flow
```
DRAFT → [Upload KYC] → KYC_PENDING → [Submit] → UNDER_REVIEW → APPROVED
                                                              ↘ REJECTED → edit → back to DRAFT
```

### Security Flow
```
Create (PENDING) → Checker/Admin APPROVE → ACTIVE (APPROVED)
```

### Share Allocation
```
Maker creates (PENDING) → Checker/Admin APPROVE → Holdings updated + Ledger entry
```

### Transfer Flow
```
INITIATED (shares locked) → SUBMITTED → UNDER_REVIEW → APPROVED+EXECUTED
                                                     ↘ REJECTED (shares unlocked)
```

---

## 🗄️ Database Models

| Model             | Purpose                            |
|-------------------|------------------------------------|
| User              | MAKER/CHECKER/ADMIN accounts       |
| Investor          | Investor records with KYC          |
| Security          | ISIN/company share pools           |
| Holding           | Per-investor per-security balances |
| Allocation        | Share allocation requests          |
| ShareTransfer     | Transfer with before/after tracking|
| TransactionLedger | Banking-style DEBIT/CREDIT log     |
| AuditLog          | Immutable SHA-256 hashed audit     |
| StatusHistory     | All status transitions             |

---

## 🔒 Key Safety Rules (enforced in code)
- No duplicate PAN numbers
- No negative shares
- No over-allocation beyond available shares
- Shares locked immediately on transfer initiation
- Unlocked only on rejection
- Maker cannot approve own data
- All actions logged with old/new data
- AuditLog is immutable (pre-save hook blocks updates/deletes)
