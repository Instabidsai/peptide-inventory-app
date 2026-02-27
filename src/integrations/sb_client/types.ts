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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          org_id: string | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          org_id?: string | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          org_id?: string | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bottles: {
        Row: {
          created_at: string
          id: string
          location: string | null
          lot_id: string
          notes: string | null
          org_id: string
          status: Database["public"]["Enums"]["bottle_status"]
          uid: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          lot_id: string
          notes?: string | null
          org_id: string
          status?: Database["public"]["Enums"]["bottle_status"]
          uid: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          lot_id?: string
          notes?: string | null
          org_id?: string
          status?: Database["public"]["Enums"]["bottle_status"]
          uid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bottles_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bottles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          linked_user_id: string | null
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          preferred_contact_method: string | null
          tier: string | null
          type: Database["public"]["Enums"]["contact_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          linked_user_id?: string | null
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          preferred_contact_method?: string | null
          tier?: string | null
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          linked_user_id?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          preferred_contact_method?: string | null
          tier?: string | null
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_notes: {
        Row: {
          id: string
          contact_id: string
          content: string
          created_at: string
          created_by: string | null
          org_id: string
        }
        Insert: {
          id?: string
          contact_id: string
          content: string
          created_at?: string
          created_by?: string | null
          org_id: string
        }
        Update: {
          id?: string
          contact_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      embeddings: {
        Row: {
          id: string
          content: string | null
          metadata: Json | null
          embedding: string | null // Vector is returned as string in REST often, or we treat opaque
        }
        Insert: {
          id?: string
          content?: string | null
          metadata?: Json | null
          embedding?: string | null
        }
        Update: {
          id?: string
          content?: string | null
          metadata?: Json | null
          embedding?: string | null
        }
        Relationships: []
      }
      lots: {
        Row: {
          cost_per_unit: number
          created_at: string
          expiry_date: string | null
          id: string
          lot_number: string
          notes: string | null
          org_id: string
          peptide_id: string
          quantity_received: number
          received_date: string
          updated_at: string
        }
        Insert: {
          cost_per_unit: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number: string
          notes?: string | null
          org_id: string
          peptide_id: string
          quantity_received: number
          received_date?: string
          updated_at?: string
        }
        Update: {
          cost_per_unit?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          lot_number?: string
          notes?: string | null
          org_id?: string
          peptide_id?: string
          quantity_received?: number
          received_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_peptide_id_fkey"
            columns: ["peptide_id"]
            isOneToOne: false
            referencedRelation: "peptides"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_items: {
        Row: {
          bottle_id: string
          created_at: string
          id: string
          movement_id: string
          price_at_sale: number | null
        }
        Insert: {
          bottle_id: string
          created_at?: string
          id?: string
          movement_id: string
          price_at_sale?: number | null
        }
        Update: {
          bottle_id?: string
          created_at?: string
          id?: string
          movement_id?: string
          price_at_sale?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movement_items_bottle_id_fkey"
            columns: ["bottle_id"]
            isOneToOne: false
            referencedRelation: "bottles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_items_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
        ]
      }
      movements: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string | null
          id: string
          movement_date: string
          notes: string | null
          org_id: string
          type: Database["public"]["Enums"]["movement_type"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          amount_paid: number
          payment_method: string | null
          payment_date: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date?: string
          notes?: string | null
          org_id: string
          type: Database["public"]["Enums"]["movement_type"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          amount_paid?: number
          payment_method?: string | null
          payment_date?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date?: string
          notes?: string | null
          org_id?: string
          type?: Database["public"]["Enums"]["movement_type"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          amount_paid?: number
          payment_method?: string | null
          payment_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movements_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      peptide_pricing: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          peptide_id: string
          price: number
          tier: Database["public"]["Enums"]["price_tier"]
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          peptide_id: string
          price: number
          tier: Database["public"]["Enums"]["price_tier"]
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          peptide_id?: string
          price?: number
          tier?: Database["public"]["Enums"]["price_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "peptide_pricing_peptide_id_fkey"
            columns: ["peptide_id"]
            isOneToOne: false
            referencedRelation: "peptides"
            referencedColumns: ["id"]
          },
        ]
      }
      peptides: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          sku: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          sku?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "peptides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          org_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          org_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          org_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_feedback: {
        Row: {
          admin_response: string | null
          comment: string | null
          created_at: string | null
          id: string
          is_read_by_client: boolean | null
          protocol_id: string | null
          rating: number | null
          response_at: string | null
          response_link: string | null
          user_id: string | null
        }
        Insert: {
          admin_response?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string
          is_read_by_client?: boolean | null
          protocol_id?: string | null
          rating?: number | null
          response_at?: string | null
          response_link?: string | null
          user_id?: string | null
        }
        Update: {
          admin_response?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string
          is_read_by_client?: boolean | null
          protocol_id?: string | null
          rating?: number | null
          response_at?: string | null
          response_link?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocol_feedback_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_items: {
        Row: {
          cost_multiplier: number | null
          created_at: string | null
          dosage_amount: number
          dosage_unit: string
          duration_days: number | null
          duration_weeks: number
          frequency: string
          id: string
          peptide_id: string
          price_tier: string
          protocol_id: string
          updated_at: string | null
        }
        Insert: {
          cost_multiplier?: number | null
          created_at?: string | null
          dosage_amount: number
          dosage_unit?: string
          duration_days?: number | null
          duration_weeks: number
          frequency: string
          id?: string
          peptide_id: string
          price_tier?: string
          protocol_id: string
          updated_at?: string | null
        }
        Update: {
          cost_multiplier?: number | null
          created_at?: string | null
          dosage_amount?: number
          dosage_unit?: string
          duration_days?: number | null
          duration_weeks?: number
          frequency?: string
          id?: string
          peptide_id?: string
          price_tier?: string
          protocol_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocol_items_peptide_id_fkey"
            columns: ["peptide_id"]
            isOneToOne: false
            referencedRelation: "peptides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_items_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_logs: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          protocol_item_id: string
          status: string | null
          taken_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          protocol_item_id: string
          status?: string | null
          taken_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          protocol_item_id?: string
          status?: string | null
          taken_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocol_logs_protocol_item_id_fkey"
            columns: ["protocol_item_id"]
            isOneToOne: false
            referencedRelation: "protocol_items"
            referencedColumns: ["id"]
          },
        ]
      }
      protocols: {
        Row: {
          contact_id: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocols_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocols_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          contact_id: string | null
          created_at: string | null
          description: string | null
          id: string
          peptide_id: string | null
          title: string
          type: string | null
          url: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          peptide_id?: string | null
          title: string
          type?: string | null
          url: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          peptide_id?: string | null
          title?: string
          type?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_peptide_id_fkey"
            columns: ["peptide_id"]
            isOneToOne: false
            referencedRelation: "peptides"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_bottle_uid: { Args: never; Returns: string }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "viewer" | "client"
      bottle_status:
      | "in_stock"
      | "sold"
      | "given_away"
      | "internal_use"
      | "lost"
      | "returned"
      | "expired"
      contact_type: "customer" | "partner" | "internal"
      movement_type: "sale" | "giveaway" | "internal_use" | "loss" | "return"
      price_tier: "retail" | "wholesale" | "at_cost"
      payment_status: "paid" | "unpaid" | "partial" | "refunded"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
  : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
  : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
  : never = never,
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
      app_role: ["admin", "staff", "viewer", "client"],
      bottle_status: [
        "in_stock",
        "sold",
        "given_away",
        "internal_use",
        "lost",
        "returned",
        "expired",
      ],
      contact_type: ["customer", "partner", "internal"],
      movement_type: ["sale", "giveaway", "internal_use", "loss", "return"],
      price_tier: ["retail", "wholesale", "at_cost"],
    },
  },
} as const
