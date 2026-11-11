from rest_framework import serializers
from .models import SolicitudMatricula

class SolicitudMatriculaSerializer(serializers.ModelSerializer):
    curso_nombre = serializers.CharField(source='curso.nombre', read_only=True)
    estudiante_nombre = serializers.SerializerMethodField()

    class Meta:
        model = SolicitudMatricula
        fields = '__all__'
        read_only_fields = ['estudiante', 'estado', 'fecha_solicitud']

    def get_estudiante_nombre(self, obj):
        return f"{obj.estudiante.first_name} {obj.estudiante.last_name}"