from __future__ import annotations
from uuid import uuid4
from pydantic import BaseModel, EmailStr

class Account(BaseModel):
    account_id: str
    email: EmailStr
    display_name: str
    role: str = "developer"

class Organization(BaseModel):
    org_id: str
    name: str
    owner_account_id: str
    plan: str = "indie"

class Invoice(BaseModel):
    invoice_id: str
    org_id: str
    amount_usd: int
    status: str = "draft"

class PlatformStore:
    def __init__(self) -> None:
        self.accounts: dict[str, Account] = {}
        self.organizations: dict[str, Organization] = {}
        self.invoices: dict[str, Invoice] = {}

    def register_account(self, email: str, display_name: str, role: str = "developer") -> Account:
        acct = Account(account_id=uuid4().hex, email=email, display_name=display_name, role=role)
        self.accounts[acct.account_id] = acct
        return acct

    def create_org(self, name: str, owner_account_id: str, plan: str = "indie") -> Organization:
        org = Organization(org_id=uuid4().hex, name=name, owner_account_id=owner_account_id, plan=plan)
        self.organizations[org.org_id] = org
        return org

    def create_invoice(self, org_id: str, amount_usd: int) -> Invoice:
        inv = Invoice(invoice_id=uuid4().hex, org_id=org_id, amount_usd=amount_usd)
        self.invoices[inv.invoice_id] = inv
        return inv
