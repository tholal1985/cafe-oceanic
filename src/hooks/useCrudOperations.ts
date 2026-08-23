import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface CrudOptions<T> {
  tableName: string;
  orderBy?: {
    column: keyof T;
    ascending?: boolean;
  };
  initialFilters?: Record<string, any>;
}

export function useCrudOperations<T extends { id: string }>(options: CrudOptions<T>) {
  const { tableName, orderBy, initialFilters = {} } = options;
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase.from(tableName).select('*');

      Object.entries(initialFilters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      if (orderBy) {
        query = query.order(orderBy.column as string, { ascending: orderBy.ascending ?? true });
      }

      const { data: fetchedData, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      if (fetchedData) setData(fetchedData as T[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [tableName, orderBy, initialFilters]);

  const create = useCallback(async (newItem: Omit<T, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data: created, error: createError } = await supabase
        .from(tableName)
        .insert([newItem])
        .select()
        .single();

      if (createError) throw createError;
      await fetchData();
      return { success: true, data: created as T };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create item';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [tableName, fetchData]);

  const update = useCallback(async (id: string, updates: Partial<Omit<T, 'id'>>) => {
    try {
      const { data: updated, error: updateError } = await supabase
        .from(tableName)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      await fetchData();
      return { success: true, data: updated as T };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update item';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [tableName, fetchData]);

  const remove = useCallback(async (id: string, confirmMessage?: string) => {
    if (confirmMessage && !confirm(confirmMessage)) {
      return { success: false, error: 'Deletion cancelled' };
    }

    try {
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      await fetchData();
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete item';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [tableName, fetchData]);

  return {
    data,
    loading,
    error,
    fetchData,
    create,
    update,
    remove,
    setData,
  };
}
