from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('certificates', '0014_solicitudmatricula_motivo_rechazo'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='curso',
            name='cupos',
            field=models.PositiveIntegerField(blank=True, help_text='Vacantes del curso. Vacío = sin límite.', null=True),
        ),
        migrations.AddField(
            model_name='curso',
            name='faltas_permitidas',
            field=models.PositiveSmallIntegerField(default=2, help_text='Faltas sin justificar que se toleran. La siguiente pone al estudiante en riesgo de desaprobar.'),
        ),
        migrations.AddField(
            model_name='solicitudmatricula',
            name='reserva_hasta',
            field=models.DateTimeField(blank=True, help_text='Fin del plazo para pagar la orden (5 días). El INDI puede ampliarlo. Vacío = fecha de solicitud + 5 días.', null=True),
        ),
        migrations.CreateModel(
            name='Asistencia',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fecha', models.DateField()),
                ('estado', models.CharField(choices=[('PRESENTE', 'Presente'), ('FALTA', 'Falta'), ('JUSTIFICADA', 'Falta justificada')], default='PRESENTE', max_length=12)),
                ('observacion', models.CharField(blank=True, default='', max_length=200)),
                ('actualizado', models.DateTimeField(auto_now=True)),
                ('curso', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='asistencias', to='certificates.curso')),
                ('estudiante', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='asistencias', to=settings.AUTH_USER_MODEL)),
                ('registrado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='asistencias_registradas', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['fecha'],
                'unique_together': {('curso', 'estudiante', 'fecha')},
            },
        ),
    ]
