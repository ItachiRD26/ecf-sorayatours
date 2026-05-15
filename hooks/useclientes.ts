"use client";

import { useState, useEffect } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Cliente } from "@/types";

function cleanData(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function useClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "clientes"), orderBy("nombre", "asc"));
    const unsub = onSnapshot(q,
      (snap) => {
        setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cliente)));
        setLoading(false);
      },
      (err) => {
        console.error("[useClientes]", err);
        setError("Error cargando clientes");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const agregar = async (data: Omit<Cliente, "id">) => {
    await addDoc(collection(db, "clientes"),
      cleanData({ ...data, creadoEn: serverTimestamp() })
    );
  };

  const actualizar = async (id: string, data: Partial<Cliente>) => {
    await updateDoc(doc(db, "clientes", id),
      cleanData({ ...data, actualizadoEn: serverTimestamp() })
    );
  };

  const eliminar = async (id: string) => {
    await deleteDoc(doc(db, "clientes", id));
  };

  return { clientes, loading, error, agregar, actualizar, eliminar };
}