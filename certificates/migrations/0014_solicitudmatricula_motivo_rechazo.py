from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('certificates', '0013_user_celular_user_codigo_universitario_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='solicitudmatricula',
            name='motivo_rechazo',
            field=models.TextField(blank=True, default='', help_text='Motivo que el INDI da al rechazar la matrícula'),
        ),
    ]
