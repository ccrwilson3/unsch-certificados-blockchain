from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('certificates', '0015_cupos_reserva_asistencia'),
    ]

    operations = [
        migrations.AddField(
            model_name='auditlog',
            name='ip_address',
            field=models.GenericIPAddressField(blank=True, null=True, verbose_name='Dirección IP'),
        ),
    ]
