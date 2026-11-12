"""Provider-neutral adapter contracts. No external service is assumed to be connected."""
from abc import ABC,abstractmethod
class ModelProvider(ABC):
    provider_id="abstract"
    @abstractmethod
    def capabilities(self): raise NotImplementedError
    @abstractmethod
    def generate(self,prompt,context=None): raise NotImplementedError
class RemoteOmniGenesisAdapter(ABC):
    """Implement only after the remote service's actual API/auth contract is verified."""
    @abstractmethod
    def health(self): raise NotImplementedError
    @abstractmethod
    def submit_job(self,job): raise NotImplementedError
class LocalMalcolmAdapter(ABC):
    """Interface contract only; no Malcolm API endpoint or credentials are embedded."""
    @abstractmethod
    def health(self): raise NotImplementedError
    @abstractmethod
    def execute(self,task): raise NotImplementedError
