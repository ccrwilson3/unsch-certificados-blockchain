"use client";

/** Código QR + clave manual para vincular la aplicación autenticadora. */
export default function ConfigurarQR({ qr, secreto }: { qr: string; secreto: string }) {
  const agrupado = secreto.match(/.{1,4}/g)?.join(" ") || secreto;
  return (
    <div className="space-y-3">
      <ol className="text-xs text-slate-600 list-decimal list-inside space-y-1">
        <li>Instala una app autenticadora en tu celular (Google Authenticator, Microsoft Authenticator o Authy).</li>
        <li>Escanea este código QR con la app.</li>
        <li>Escribe abajo el código de 6 dígitos que muestra la app.</li>
      </ol>
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Código QR para la aplicación autenticadora" className="w-44 h-44 border border-slate-200 rounded-xl" />
      </div>
      <div className="text-center">
        <p className="text-[11px] text-slate-500">¿No puedes escanear? Escribe esta clave en la app:</p>
        <code className="text-xs font-mono font-semibold text-slate-800 select-all break-all">{agrupado}</code>
      </div>
    </div>
  );
}
