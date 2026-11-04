/** Staff roles. The column is a VARCHAR, so adding a role needs no migration. */
export enum Role {
  /** Everything, including user and role management. */
  Admin = 'admin',
  /** Day-to-day lending: customers, disbursements, repayments. */
  LoanOfficer = 'loan_officer',
  /** Read-only: customers, loans and reports. */
  Auditor = 'auditor',
}
