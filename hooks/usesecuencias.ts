import { doc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { TipoECF } from "@/types";

export async function nextSecuencia(tipoECF: TipoECF): Promise<number> {
  const ref = doc(db, "config", "secuencias");
  return await runTransaction(db, async (tx) => {
    const snap    = await tx.get(ref);
    const current = snap.exists() ? ((snap.data() as Record<string, number>)[tipoECF] ?? 0) : 0;
    const next    = current + 1;
    tx.set(ref, { [tipoECF]: next }, { merge: true });
    return next;
  });
}