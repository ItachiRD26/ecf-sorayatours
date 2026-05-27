import { doc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { TipoECF } from "@/types";

// TODO(cert): Eliminar CERT_USADOS una vez completado el proceso de certificación DGII.
// Estos números fueron consumidos en el Paso 2 (set de comprobantes) y no pueden reutilizarse.
const CERT_USADOS: Partial<Record<TipoECF, Set<number>>> = {
  E31: new Set([1, 2, 4, 6]),
  E32: new Set([4, 6, 11, 13, 14, 15]),
  E33: new Set([1]),
  E34: new Set([1, 16]),
  E41: new Set([1, 7, 10]),
  E43: new Set([9, 10, 11]),
  E44: new Set([7, 11]),
  E45: new Set([1, 9]),
  E46: new Set([1, 11]),
  E47: new Set([8, 9]),
};

export async function nextSecuencia(tipoECF: TipoECF): Promise<number> {
  const ref = doc(db, "config", "secuencias");
  return await runTransaction(db, async (tx) => {
    const snap    = await tx.get(ref);
    const current = snap.exists() ? ((snap.data() as Record<string, number>)[tipoECF] ?? 0) : 0;
    const blocked = CERT_USADOS[tipoECF];
    let next = current + 1;
    // TODO(cert): Eliminar este bloque junto con CERT_USADOS al finalizar certificación.
    while (blocked?.has(next)) next++;
    tx.set(ref, { [tipoECF]: next }, { merge: true });
    return next;
  });
}