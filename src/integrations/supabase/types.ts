export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      access_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          id: number
          new_values: Json | null
          old_values: Json | null
          target_user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          target_user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          target_user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          created_by: string | null
          critical_stock_threshold: number
          id: boolean
          low_stock_threshold: number
          operating_close: string
          operating_open: string
          state_helpline: string
          transfer_approval_min_quantity: number
          transfer_approval_required: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          critical_stock_threshold: number
          id?: boolean
          low_stock_threshold: number
          operating_close: string
          operating_open: string
          state_helpline: string
          transfer_approval_min_quantity?: number
          transfer_approval_required: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          critical_stock_threshold?: number
          id?: boolean
          low_stock_threshold?: number
          operating_close?: string
          operating_open?: string
          state_helpline?: string
          transfer_approval_min_quantity?: number
          transfer_approval_required?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cities: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      master_data_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          id: number
          new_values: Json | null
          old_values: Json | null
          record_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          id?: never
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          category: string
          created_at: string
          event_key: string
          href: string
          id: string
          metadata: Json
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          event_key: string
          href: string
          id?: string
          metadata?: Json
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          event_key?: string
          href?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          abv_percent: number
          barcode: string | null
          brand: string
          category: Database["public"]["Enums"]["product_category"]
          created_at: string
          created_by: string | null
          excise_registration_no: string
          hsn_code: string | null
          id: string
          is_active: boolean
          label_approval_no: string | null
          manufacturer: string
          mrp: number
          name: string
          packaging: Database["public"]["Enums"]["packaging_type"]
          sku: string
          units_per_case: number
          updated_at: string
          updated_by: string | null
          volume_ml: number
        }
        Insert: {
          abv_percent: number
          barcode?: string | null
          brand: string
          category: Database["public"]["Enums"]["product_category"]
          created_at?: string
          created_by?: string | null
          excise_registration_no: string
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          label_approval_no?: string | null
          manufacturer: string
          mrp: number
          name: string
          packaging: Database["public"]["Enums"]["packaging_type"]
          sku: string
          units_per_case: number
          updated_at?: string
          updated_by?: string | null
          volume_ml: number
        }
        Update: {
          abv_percent?: number
          barcode?: string | null
          brand?: string
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          created_by?: string | null
          excise_registration_no?: string
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          label_approval_no?: string | null
          manufacturer?: string
          mrp?: number
          name?: string
          packaging?: Database["public"]["Enums"]["packaging_type"]
          sku?: string
          units_per_case?: number
          updated_at?: string
          updated_by?: string | null
          volume_ml?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      shop_inventory: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          quantity_on_hand: number
          safety_minimum: number
          shop_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          quantity_on_hand?: number
          safety_minimum?: number
          shop_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          quantity_on_hand?: number
          safety_minimum?: number
          shop_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_inventory_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          address: string | null
          city_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          shop_number: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          city_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          shop_number: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          city_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          shop_number?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shops_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shops_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_id: string
          actor_name: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          adjust_reason: Database["public"]["Enums"]["adjust_reason"] | null
          balance_after: number
          balance_before: number
          city_id: string
          counterparty: string | null
          created_at: string
          delta: number
          id: string
          idempotency_key: string
          justification: string | null
          movement_type: Database["public"]["Enums"]["movement_type"]
          product_id: string
          quantity: number
          reference: string
          shop_id: string
          transfer_id: string | null
          txn_no: number
        }
        Insert: {
          actor_id: string
          actor_name?: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          adjust_reason?: Database["public"]["Enums"]["adjust_reason"] | null
          balance_after: number
          balance_before: number
          city_id: string
          counterparty?: string | null
          created_at?: string
          delta: number
          id?: string
          idempotency_key: string
          justification?: string | null
          movement_type: Database["public"]["Enums"]["movement_type"]
          product_id: string
          quantity: number
          reference: string
          shop_id: string
          transfer_id?: string | null
          txn_no?: never
        }
        Update: {
          actor_id?: string
          actor_name?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"]
          adjust_reason?: Database["public"]["Enums"]["adjust_reason"] | null
          balance_after?: number
          balance_before?: number
          city_id?: string
          counterparty?: string | null
          created_at?: string
          delta?: number
          id?: string
          idempotency_key?: string
          justification?: string | null
          movement_type?: Database["public"]["Enums"]["movement_type"]
          product_id?: string
          quantity?: number
          reference?: string
          shop_id?: string
          transfer_id?: string | null
          txn_no?: never
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_events: {
        Row: {
          actor_id: string
          actor_name: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          from_status: Database["public"]["Enums"]["transfer_status"] | null
          id: number
          note: string | null
          to_status: Database["public"]["Enums"]["transfer_status"]
          transfer_id: string
        }
        Insert: {
          actor_id: string
          actor_name?: string | null
          actor_role: Database["public"]["Enums"]["app_role"]
          created_at?: string
          from_status?: Database["public"]["Enums"]["transfer_status"] | null
          id?: never
          note?: string | null
          to_status: Database["public"]["Enums"]["transfer_status"]
          transfer_id: string
        }
        Update: {
          actor_id?: string
          actor_name?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          from_status?: Database["public"]["Enums"]["transfer_status"] | null
          id?: never
          note?: string | null
          to_status?: Database["public"]["Enums"]["transfer_status"]
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_events_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfer_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_events_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          dest_city_id: string
          dest_label: string
          dest_shop_id: string
          id: string
          idempotency_key: string
          product_id: string
          quantity: number
          reason: string
          requested_at: string
          requested_by: string
          source_city_id: string
          source_label: string
          source_shop_id: string
          status: Database["public"]["Enums"]["transfer_status"]
          txn_no: number
          updated_at: string
          waybill_no: string | null
        }
        Insert: {
          dest_city_id: string
          dest_label: string
          dest_shop_id: string
          id?: string
          idempotency_key: string
          product_id: string
          quantity: number
          reason: string
          requested_at?: string
          requested_by: string
          source_city_id: string
          source_label: string
          source_shop_id: string
          status?: Database["public"]["Enums"]["transfer_status"]
          txn_no?: never
          updated_at?: string
          waybill_no?: string | null
        }
        Update: {
          dest_city_id?: string
          dest_label?: string
          dest_shop_id?: string
          id?: string
          idempotency_key?: string
          product_id?: string
          quantity?: number
          reason?: string
          requested_at?: string
          requested_by?: string
          source_city_id?: string
          source_label?: string
          source_shop_id?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          txn_no?: never
          updated_at?: string
          waybill_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfers_dest_city_id_fkey"
            columns: ["dest_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_dest_shop_id_fkey"
            columns: ["dest_shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_source_city_id_fkey"
            columns: ["source_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_source_shop_id_fkey"
            columns: ["source_shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          scope_city_id: string | null
          scope_code: string | null
          scope_shop_id: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          scope_city_id?: string | null
          scope_code?: string | null
          scope_shop_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          scope_city_id?: string | null
          scope_code?: string | null
          scope_shop_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_scope_city_id_fkey"
            columns: ["scope_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_scope_shop_id_fkey"
            columns: ["scope_shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inventory_status: {
        Row: {
          category: Database["public"]["Enums"]["product_category"] | null
          city_code: string | null
          city_id: string | null
          city_name: string | null
          health: string | null
          id: string | null
          last_audit_at: string | null
          mrp: number | null
          packaging: Database["public"]["Enums"]["packaging_type"] | null
          product_id: string | null
          product_name: string | null
          quantity_on_hand: number | null
          safety_minimum: number | null
          shop_id: string | null
          shop_name: string | null
          shop_number: string | null
          sku: string | null
          updated_at: string | null
          volume_ml: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_inventory_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shops_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movement_log: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          adjust_reason: Database["public"]["Enums"]["adjust_reason"] | null
          balance_after: number | null
          balance_before: number | null
          city_id: string | null
          city_name: string | null
          counterparty: string | null
          created_at: string | null
          delta: number | null
          id: string | null
          justification: string | null
          movement_type: Database["public"]["Enums"]["movement_type"] | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          reference: string | null
          shop_id: string | null
          shop_name: string | null
          shop_number: string | null
          sku: string | null
          transfer_id: string | null
          txn_no: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_log: {
        Row: {
          category: Database["public"]["Enums"]["product_category"] | null
          dest_city_id: string | null
          dest_label: string | null
          dest_shop_id: string | null
          id: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          reason: string | null
          requested_at: string | null
          requested_by: string | null
          requester_name: string | null
          sku: string | null
          source_city_id: string | null
          source_label: string | null
          source_shop_id: string | null
          status: Database["public"]["Enums"]["transfer_status"] | null
          txn_no: number | null
          updated_at: string | null
          waybill_no: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfers_dest_city_id_fkey"
            columns: ["dest_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_dest_shop_id_fkey"
            columns: ["dest_shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_source_city_id_fkey"
            columns: ["source_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_source_shop_id_fkey"
            columns: ["source_shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      actor_label: { Args: { _uid: string }; Returns: string }
      adjust_stock: {
        Args: {
          _audit_memo: string
          _direction: string
          _idempotency_key: string
          _justification: string
          _product_id: string
          _quantity: number
          _reason: Database["public"]["Enums"]["adjust_reason"]
          _shop_id: string
        }
        Returns: Json
      }
      admin_set_user_access: {
        Args: {
          _is_active: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _scope_shop_id: string
          _user_id: string
        }
        Returns: Json
      }
      apply_stock_movement: {
        Args: {
          _counterparty: string
          _idempotency_key: string
          _justification: string
          _product_id: string
          _quantity: number
          _reason: Database["public"]["Enums"]["adjust_reason"]
          _reference: string
          _shop_id: string
          _type: Database["public"]["Enums"]["movement_type"]
        }
        Returns: Json
      }
      can_operate_shop: { Args: { _shop_id: string }; Returns: boolean }
      can_read_shop: { Args: { _shop_id: string }; Returns: boolean }
      create_notification: {
        Args: {
          _body: string
          _category: string
          _event_key: string
          _href: string
          _metadata?: Json
          _recipient_id: string
          _title: string
        }
        Returns: undefined
      }
      current_scope_city_id: { Args: never; Returns: string }
      current_scope_shop_id: { Args: never; Returns: string }
      has_operational_access: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_state_admin: { Args: never; Returns: boolean }
      issue_stock: {
        Args: {
          _destination: string
          _idempotency_key: string
          _product_id: string
          _quantity: number
          _register_ref: string
          _shop_id: string
        }
        Returns: Json
      }
      list_transfer_destinations: {
        Args: never
        Returns: {
          city_id: string
          id: string
          label: string
        }[]
      }
      log_transfer_event: {
        Args: {
          _from: Database["public"]["Enums"]["transfer_status"]
          _note: string
          _t: string
          _to: Database["public"]["Enums"]["transfer_status"]
        }
        Returns: undefined
      }
      receive_stock: {
        Args: {
          _challan_no: string
          _idempotency_key: string
          _product_id: string
          _quantity: number
          _shop_id: string
          _source: string
        }
        Returns: Json
      }
      request_transfer: {
        Args: {
          _dest_shop_id: string
          _idempotency_key: string
          _product_id: string
          _quantity: number
          _reason: string
          _source_shop_id: string
        }
        Returns: Json
      }
      transition_transfer: {
        Args: {
          _action: string
          _note: string
          _transfer_id: string
          _waybill_no: string
        }
        Returns: Json
      }
    }
    Enums: {
      adjust_reason:
        | "audit_reconciliation"
        | "breakage"
        | "damage"
        | "expiry"
        | "other"
      app_role:
        | "state_admin"
        | "district_manager"
        | "warehouse_manager"
        | "shop_manager"
        | "auditor"
      movement_type:
        | "receive"
        | "issue"
        | "adjust_surplus"
        | "adjust_writeoff"
        | "transfer_out"
        | "transfer_in"
      packaging_type:
        | "glass_bottle"
        | "pet_bottle"
        | "can"
        | "tetra_pack"
        | "keg"
      product_category: "imfl" | "beer" | "wine" | "rtd"
      transfer_status:
        | "requested"
        | "approved"
        | "dispatched"
        | "received"
        | "rejected"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      adjust_reason: [
        "audit_reconciliation",
        "breakage",
        "damage",
        "expiry",
        "other",
      ],
      app_role: [
        "state_admin",
        "district_manager",
        "warehouse_manager",
        "shop_manager",
        "auditor",
      ],
      movement_type: [
        "receive",
        "issue",
        "adjust_surplus",
        "adjust_writeoff",
        "transfer_out",
        "transfer_in",
      ],
      packaging_type: [
        "glass_bottle",
        "pet_bottle",
        "can",
        "tetra_pack",
        "keg",
      ],
      product_category: ["imfl", "beer", "wine", "rtd"],
      transfer_status: [
        "requested",
        "approved",
        "dispatched",
        "received",
        "rejected",
        "cancelled",
      ],
    },
  },
} as const

