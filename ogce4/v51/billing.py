"""Payment-provider boundary. No payment collection or PCI handling is implemented here."""
from dataclasses import dataclass
@dataclass(frozen=True)
class CheckoutRequest:
    customer_id:str
    product_id:str
    success_url:str
    cancel_url:str
class BillingProvider:
    def create_checkout(self,request:CheckoutRequest): raise NotImplementedError
    def verify_webhook(self,headers,body): raise NotImplementedError
class DisabledBillingProvider(BillingProvider):
    def create_checkout(self,request): raise RuntimeError("No billing provider configured; connect a compliant provider first")
    def verify_webhook(self,headers,body): raise RuntimeError("No billing provider configured")
