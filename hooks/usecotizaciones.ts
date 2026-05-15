"use client";

import { useState, useEffect } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Cotizacion, EstadoCotizacion } from "@/types";

function cleanData(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function useCotizaciones() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "cotizaciones"), orderBy("fecha", "desc"));
    const unsub = onSnapshot(q,
      (snap) => {
        setCotizaciones(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cotizacion)));
        setLoading(false);
      },
      (err) => {
        console.error("[useCotizaciones]", err);
        setError("Error cargando cotizaciones");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const agregar = async (data: Omit<Cotizacion, "id">) => {
    const ref = await addDoc(collection(db, "cotizaciones"),
      cleanData({ ...data, creadoEn: serverTimestamp() })
    );
    return ref.id;
  };

  const actualizar = async (id: string, data: Partial<Cotizacion>) => {
    await updateDoc(doc(db, "cotizaciones", id),
      cleanData({ ...data, actualizadoEn: serverTimestamp() })
    );
  };

  const cambiarEstado = async (id: string, estado: EstadoCotizacion) => {
    await updateDoc(doc(db, "cotizaciones", id), {
      estado, actualizadoEn: serverTimestamp(),
    });
  };

  const eliminar = async (id: string) => {
    await deleteDoc(doc(db, "cotizaciones", id));
  };

  return { cotizaciones, loading, error, agregar, actualizar, cambiarEstado, eliminar };
}