"""IP del cliente de la petición en curso, para que la auditoría la registre sin tocar cada vista."""
from contextvars import ContextVar

ip_actual = ContextVar('ip_actual', default=None)


def ip_de_peticion(request):
    """IP real del visitante. Detrás de nginx (CONFIAR_EN_PROXY=True) se usa X-Forwarded-For."""
    from django.conf import settings
    reenviada = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if reenviada and getattr(settings, 'CONFIAR_EN_PROXY', False):
        return reenviada.split(',')[0].strip()[:45]
    return (request.META.get('REMOTE_ADDR') or '')[:45] or None


class IPAuditoriaMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = ip_actual.set(ip_de_peticion(request))
        try:
            return self.get_response(request)
        finally:
            ip_actual.reset(token)
