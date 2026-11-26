from django.core.management.base import BaseCommand, CommandError

from certificates.models import DobleFactor, User


class Command(BaseCommand):
    help = "Quita la verificación en dos pasos de un usuario (por ejemplo, si el administrador perdió su teléfono)."

    def add_arguments(self, parser):
        parser.add_argument('username')

    def handle(self, *args, **opciones):
        user = User.objects.filter(username=opciones['username']).first()
        if user is None:
            raise CommandError("No existe ese usuario.")
        borrados, _ = DobleFactor.objects.filter(user=user).delete()
        self.stdout.write(self.style.SUCCESS(
            f"Verificación en dos pasos quitada a {user.username}." if borrados else "Ese usuario no tenía 2FA activo."
        ))
