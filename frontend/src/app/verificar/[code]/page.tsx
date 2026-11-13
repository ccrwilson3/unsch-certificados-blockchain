"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams } from "next/navigation";

function VerificacionContenido() {
  const params = useParams();
  const code = params?.code as string;

  const [resultado, setResultado] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const verificar = async () => {
      if (!code) return;
      try {
        const res = await fetch(`http://192.168.100.32:8000/api/verificar/${code}/`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.existe) {
            setResultado(data);
          } else {
            setError(data.mensaje || "El certificado no se encuentra registrado.");
          }
        } else {
          setError("El certificado no existe o el código es inválido.");
        }
      } catch (err) {
        setError("Error de comunicación con el nodo de verificación.");
      } finally {
        setLoading(false);
      }
    };

    verificar();
  }, [code]);

  if (loading) {
    return (
      <div className="text-center py-12 p-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-4"></div>
        <p className="text-sm text-slate-500">Consultando libro mayor y registros de la UNSCH...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 p-8">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
          ✕
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Certificado No Encontrado</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">{error}</p>
        <div className="p-4 bg-slate-50 rounded-2xl text-xs text-slate-400 font-mono">
          Código Consultado: {code}
        </div>
      </div>
    );
  }

  // --- Estado real: base de datos + integridad + blockchain ---
  const revocado =
    resultado.status_code === "REVOKED" || resultado.estado_blockchain === "REVOCADO";
  const valido = resultado.is_valid === true;
  const enBlockchain =
    resultado.estado_blockchain === "VALIDO" || resultado.estado_blockchain === "REVOCADO";

  let motivoNoValido = "No se pudo confirmar la autenticidad de este certificado.";
  if (resultado.estado_blockchain === "NO ENCONTRADO") {
    motivoNoValido =
      "El registro existe en la base de datos del INDI, pero su hash no figura en la blockchain.";
  } else if (resultado.estado_blockchain === "ERROR_CONSULTA") {
    motivoNoValido =
      "No se pudo consultar la blockchain en este momento. Intente nuevamente más tarde.";
  } else if (resultado.hash_integro === false) {
    motivoNoValido =
      "Los datos del certificado no coinciden con el hash que fue registrado.";
  }

  return (
    <div className="p-8 space-y-6">
      {/* --- VALIDACIÓN DE ESTADO --- */}
      {revocado ? (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-600 text-white rounded-xl flex items-center justify-center font-bold text-lg">
              ✕
            </div>
            <div>
              <h3 className="text-sm font-bold text-rose-900">Certificado Revocado / Anulado</h3>
              <p className="text-xs text-rose-700">Este documento ha perdido su validez legal e institucional</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-rose-200 text-xs text-rose-800 space-y-1">
            <p><strong>Motivo de Revocación:</strong> {resultado.revocation_reason || "No especificado"}</p>
            {resultado.revoked_at && (
              <p><strong>Fecha de Anulación:</strong> {new Date(resultado.revoked_at).toLocaleString()}</p>
            )}
          </div>
        </div>
      ) : valido ? (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold text-lg">
              ✓
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-900">Certificado Válido y Auténtico</h3>
              <p className="text-xs text-emerald-700">Emitido por el INDI y verificado en la blockchain</p>
            </div>
          </div>
          <span className="px-3 py-1 bg-emerald-200/60 text-emerald-900 text-xs font-extrabold rounded-full">
            OFICIAL
          </span>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center font-bold text-lg">
              !
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">Certificado No Verificado</h3>
              <p className="text-xs text-amber-800">{motivoNoValido}</p>
            </div>
          </div>
        </div>
      )}

      {/* Datos del Certificado */}
      <div className="space-y-3">
        <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
          <span className="text-slate-400 text-xs">Estudiante Acreditado:</span>
          <span className="font-bold text-slate-800">{resultado.estudiante}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
          <span className="text-slate-400 text-xs">Código Registro:</span>
          <span className="font-mono font-semibold text-slate-700">{resultado.codigo}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
          <span className="text-slate-400 text-xs">Programa de Idioma:</span>
          <span className="font-semibold text-slate-800">{resultado.idioma} ({resultado.nivel})</span>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
          <span className="text-slate-400 text-xs">Subnivel Académico:</span>
          <span className="font-semibold text-blue-700">{resultado.subnivel || "Nivel I"}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
          <span className="text-slate-400 text-xs">Año de Estudios:</span>
          <span className="font-semibold text-slate-800">{resultado.anio || "—"}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100 text-sm">
          <span className="text-slate-400 text-xs">Fecha de Emisión:</span>
          <span className="text-slate-600">
            {resultado.fecha_emision ? new Date(resultado.fecha_emision).toLocaleDateString() : "—"}
          </span>
        </div>
      </div>

      {/* Bloque de Respaldo Blockchain / Hash */}
      <div className="bg-slate-900 text-slate-300 p-4 rounded-2xl space-y-3 text-xs">
        <div className="flex items-center justify-between text-slate-400 font-semibold">
          <span>Trazabilidad Criptográfica</span>
          {enBlockchain ? (
            <span className="text-emerald-400 flex items-center gap-1 font-bold">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span> Registrado en Blockchain
            </span>
          ) : (
            <span className="text-amber-400 flex items-center gap-1 font-bold">
              <span className="w-2 h-2 bg-amber-400 rounded-full"></span> Sin registro en Blockchain
            </span>
          )}
        </div>

        <div className="font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-800 break-all text-[11px] text-blue-300 space-y-2">
          <div>
            <span className="text-slate-500 block text-[10px] font-semibold">HASH SHA-256 DEL DOCUMENTO:</span>
            {resultado.certificate_hash}
          </div>
          {resultado.blockchain_tx_hash && (
            <div>
              <span className="text-slate-500 block text-[10px] font-semibold">TX HASH (TRANSACTION ID):</span>
              <span className="text-emerald-300">{resultado.blockchain_tx_hash}</span>
            </div>
          )}
        </div>
      </div>

      {/* Botón de Descarga Directa: solo para certificados verificados */}
      {valido ? (
        <a
          href={`http://192.168.100.32:8000/api/certificado/${resultado.codigo}/descargar/`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 bg-blue-600 text-white text-center rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors block"
        >
          📄 Descargar Copia Oficial en PDF
        </a>
      ) : (
        <div className="w-full py-3 bg-slate-200 text-slate-500 text-center rounded-xl font-semibold text-sm cursor-not-allowed">
          🚫 Descarga no disponible ({revocado ? "Certificado Anulado" : "Certificado No Verificado"})
        </div>
      )}
    </div>
  );
}

export default function VerificarCertificadoPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Encabezado Institucional */}
        <div className="bg-slate-900 text-white p-6 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>
          <p className="text-xs font-semibold tracking-widest text-blue-400 uppercase">
            Universidad Nacional de San Cristóbal de Huamanga
          </p>
          <h1 className="text-xl font-bold mt-1">Verificador Público de Certificados</h1>
          <p className="text-xs text-slate-400 mt-1">
            Portal Oficial de Autenticidad e Integridad Blockchain (INDI - UNSCH)
          </p>
        </div>

        {/* Suspense obligatorio protegiendo al hook de navegación dinámico */}
        <Suspense fallback={
          <div className="text-center py-12 p-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-4"></div>
            <p className="text-sm text-slate-500">Cargando módulo de verificación...</p>
          </div>
        }>
          <VerificacionContenido />
        </Suspense>
      </div>
    </main>
  );
}