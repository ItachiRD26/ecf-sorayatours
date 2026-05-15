"use client";

import { useState, useEffect } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc,
  doc, query, orderBy, serverTimestamp, where, getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CuentaPorCobrar, EstadoCuenta, Abono } from "@/types";
import { v4 as uuid } from "uuid";

function cleanData(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function useCuentasPorCobrar() {
  const [cuentas, setCuentas] = useState<CuentaPorCobrar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "cuentasPorCobrar"), orderBy("fecha", "desc"));
    const unsub = onSnapshot(q,
      (snap) => {
        setCuentas(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CuentaPorCobrar)));
        setLoading(false);
      },
      (err) => {
        console.error("[useCuentasPorCobrar]", err);
        setError("Error cargando cuentas por cobrar");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const agregar = async (data: Omit<CuentaPorCobrar, "id">) => {
    const ref = await addDoc(collection(db, "cuentasPorCobrar"),
      cleanData({ ...data, creadoEn: serverTimestamp() })
    );
    return ref.id;
  };

  const registrarAbono = async (id: string, abono: Omit<Abono, "id">) => {
    const cuenta = cuentas.find((c) => c.id === id);
    if (!cuenta) return;

    const nuevoAbono: Abono = {
      ...abono,
      id:            uuid(),
      registradoEn:  new Date().toISOString(),
    };
    const nuevoPagado = cuenta.pagado + abono.monto;
    const pendiente   = Math.max(0, cuenta.monto - nuevoPagado - cuenta.devuelto - cuenta.creditos);
    const nuevoEstado: EstadoCuenta = pendiente <= 0 ? "pagada" : cuenta.estado;

    await updateDoc(doc(db, "cuentasPorCobrar", id), {
      pagado:        nuevoPagado,
      abonos:        [...cuenta.abonos, nuevoAbono],
      estado:        nuevoEstado,
      actualizadoEn: serverTimestamp(),
    });

    // Si quedó pagada, actualizar la factura también
    if (pendiente <= 0 && cuenta.numeroFactura) {
      try {
        const snap = await getDocs(
          query(collection(db, "facturas"), where("eCF", "==", cuenta.numeroFactura))
        );
        if (!snap.empty && snap.docs[0].data().estado === "pendiente") {
          await updateDoc(doc(db, "facturas", snap.docs[0].id), {
            estado:        "pagada",
            actualizadoEn: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error("[CxC] Error actualizando factura:", err);
      }
    }
  };

  const actualizar = async (id: string, data: Partial<CuentaPorCobrar>) => {
    await updateDoc(doc(db, "cuentasPorCobrar", id),
      cleanData({ ...data, actualizadoEn: serverTimestamp() })
    );
  };

  const cambiarEstado = async (id: string, estado: EstadoCuenta) => {
    await updateDoc(doc(db, "cuentasPorCobrar", id), {
      estado, actualizadoEn: serverTimestamp(),
    });
  };

  return { cuentas, loading, error, agregar, registrarAbono, actualizar, cambiarEstado };
}