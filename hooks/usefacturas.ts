"use client";

import { useState, useEffect } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc,
  doc, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Factura, EstadoFactura } from "@/types";

function cleanFactura(data: Omit<Factura, "id">): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function useFacturas() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "facturas"), orderBy("fecha", "desc"));
    const unsub = onSnapshot(q,
      (snap) => {
        setFacturas(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Factura)));
        setLoading(false);
      },
      (err) => {
        console.error("[useFacturas]", err);
        setError("Error cargando facturas");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const agregar = async (data: Omit<Factura, "id">) => {
    const cleaned = cleanFactura(data);
    const ref = await addDoc(collection(db, "facturas"), {
      ...cleaned, creadoEn: serverTimestamp(),
    });
    return ref.id;
  };

  const cambiarEstado = async (id: string, estado: EstadoFactura) => {
    await updateDoc(doc(db, "facturas", id), { estado, actualizadoEn: serverTimestamp() });
  };

  const actualizar = async (id: string, data: Partial<Factura>) => {
    const cleaned = cleanFactura(data as Omit<Factura, "id">);
    await updateDoc(doc(db, "facturas", id), { ...cleaned, actualizadoEn: serverTimestamp() });
  };

  return { facturas, loading, error, agregar, cambiarEstado, actualizar };
}