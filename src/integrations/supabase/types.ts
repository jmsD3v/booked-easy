export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      appointments: {
        Row: {
          appointment_date: string;
          branch_id: string | null;
          business_id: string;
          client_email: string | null;
          client_name: string;
          client_phone: string;
          created_at: string;
          end_time: string;
          id: string;
          manage_token: string;
          notes: string | null;
          reminder_sent_at: string | null;
          service_id: string;
          staff_id: string | null;
          start_time: string;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          appointment_date: string;
          branch_id?: string | null;
          business_id: string;
          client_email?: string | null;
          client_name: string;
          client_phone: string;
          created_at?: string;
          end_time: string;
          id?: string;
          manage_token?: string;
          notes?: string | null;
          reminder_sent_at?: string | null;
          service_id: string;
          staff_id?: string | null;
          start_time: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Update: {
          appointment_date?: string;
          branch_id?: string | null;
          business_id?: string;
          client_email?: string | null;
          client_name?: string;
          client_phone?: string;
          created_at?: string;
          end_time?: string;
          id?: string;
          manage_token?: string;
          notes?: string | null;
          reminder_sent_at?: string | null;
          service_id?: string;
          staff_id?: string | null;
          start_time?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      branches: {
        Row: {
          address: string | null;
          business_id: string;
          created_at: string;
          id: string;
          is_main: boolean | null;
          name: string;
          phone: string | null;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          business_id: string;
          created_at?: string;
          id?: string;
          is_main?: boolean | null;
          name: string;
          phone?: string | null;
        };
        Update: {
          address?: string | null;
          business_id?: string;
          created_at?: string;
          id?: string;
          is_main?: boolean | null;
          name?: string;
          phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      business_hours: {
        Row: {
          business_id: string;
          close_time: string;
          day_of_week: number;
          id: string;
          is_open: boolean | null;
          open_time: string;
        };
        ComputedFields: never;
        Insert: {
          business_id: string;
          close_time?: string;
          day_of_week: number;
          id?: string;
          is_open?: boolean | null;
          open_time?: string;
        };
        Update: {
          business_id?: string;
          close_time?: string;
          day_of_week?: number;
          id?: string;
          is_open?: boolean | null;
          open_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_hours_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: {
          buffer_minutes: number;
          category: string;
          created_at: string;
          description: string | null;
          email: string | null;
          id: string;
          logo_url: string | null;
          max_lead_days: number;
          min_lead_hours: number;
          name: string;
          owner_id: string;
          payment_alias: string | null;
          payment_note: string | null;
          payment_qr_url: string | null;
          phone: string | null;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          buffer_minutes?: number;
          category?: string;
          created_at?: string;
          description?: string | null;
          email?: string | null;
          id?: string;
          logo_url?: string | null;
          max_lead_days?: number;
          min_lead_hours?: number;
          name: string;
          owner_id: string;
          payment_alias?: string | null;
          payment_note?: string | null;
          payment_qr_url?: string | null;
          phone?: string | null;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          buffer_minutes?: number;
          category?: string;
          created_at?: string;
          description?: string | null;
          email?: string | null;
          id?: string;
          logo_url?: string | null;
          max_lead_days?: number;
          min_lead_hours?: number;
          name?: string;
          owner_id?: string;
          payment_alias?: string | null;
          payment_note?: string | null;
          payment_qr_url?: string | null;
          phone?: string | null;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      schedule_blocks: {
        Row: {
          block_date: string;
          business_id: string;
          created_at: string;
          id: string;
          reason: string | null;
          staff_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          block_date: string;
          business_id: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
          staff_id?: string | null;
        };
        Update: {
          block_date?: string;
          business_id?: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
          staff_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_blocks_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          business_id: string;
          created_at: string;
          description: string | null;
          duration_minutes: number;
          id: string;
          is_active: boolean | null;
          name: string;
          price: number;
        };
        ComputedFields: never;
        Insert: {
          business_id: string;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean | null;
          name: string;
          price?: number;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: {
          avatar_url: string | null;
          business_id: string;
          created_at: string;
          email: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          phone: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          business_id: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          phone?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          business_id?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "staff_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_schedules: {
        Row: {
          day_of_week: number;
          end_time: string;
          id: string;
          is_available: boolean | null;
          staff_id: string;
          start_time: string;
        };
        ComputedFields: never;
        Insert: {
          day_of_week: number;
          end_time: string;
          id?: string;
          is_available?: boolean | null;
          staff_id: string;
          start_time: string;
        };
        Update: {
          day_of_week?: number;
          end_time?: string;
          id?: string;
          is_available?: boolean | null;
          staff_id?: string;
          start_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_schedules_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_configs: {
        Row: {
          access_token: string | null;
          business_id: string;
          confirmation_message: string | null;
          created_at: string;
          id: string;
          is_active: boolean | null;
          phone_number_id: string | null;
          reminder_message: string | null;
        };
        ComputedFields: never;
        Insert: {
          access_token?: string | null;
          business_id: string;
          confirmation_message?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean | null;
          phone_number_id?: string | null;
          reminder_message?: string | null;
        };
        Update: {
          access_token?: string | null;
          business_id?: string;
          confirmation_message?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean | null;
          phone_number_id?: string | null;
          reminder_message?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_configs_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: true;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_messages: {
        Row: {
          appointment_id: string | null;
          body: string;
          business_id: string;
          created_at: string;
          error: string | null;
          id: string;
          message_type: string;
          status: Database["public"]["Enums"]["whatsapp_message_status"];
          to_phone: string;
        };
        ComputedFields: never;
        Insert: {
          appointment_id?: string | null;
          body: string;
          business_id: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          message_type: string;
          status: Database["public"]["Enums"]["whatsapp_message_status"];
          to_phone: string;
        };
        Update: {
          appointment_id?: string | null;
          body?: string;
          business_id?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          message_type?: string;
          status?: Database["public"]["Enums"]["whatsapp_message_status"];
          to_phone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_messages_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      appointment_starts_at: {
        Args: { p_business_id: string; p_date: string; p_time: string };
        Returns: string;
      };
      cancel_appointment_by_token: {
        Args: { p_token: string };
        Returns: boolean;
      };
      edge_functions_base_url: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      get_appointment_by_token: {
        Args: { p_token: string };
        Returns: {
          appointment_date: string;
          business_id: string;
          business_name: string;
          business_slug: string;
          client_name: string;
          duration_minutes: number;
          id: string;
          service_id: string;
          service_name: string;
          staff_id: string;
          start_time: string;
          status: Database["public"]["Enums"]["appointment_status"];
        }[];
      };
      get_booked_slots: {
        Args: { p_business_id: string; p_date: string };
        Returns: {
          end_time: string;
          staff_id: string;
          start_time: string;
        }[];
      };
      get_public_staff: {
        Args: { p_business_id: string };
        Returns: {
          avatar_url: string;
          business_id: string;
          id: string;
          is_active: boolean;
          name: string;
        }[];
      };
      is_business_owner: { Args: { _business_id: string }; Returns: boolean };
      is_valid_timezone: { Args: { tz: string }; Returns: boolean };
      reschedule_appointment_by_token: {
        Args: {
          p_new_date: string;
          p_new_end: string;
          p_new_start: string;
          p_token: string;
        };
        Returns: boolean;
      };
      send_appointment_reminders: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      unaccent: { Args: { "": string }; Returns: string };
    };
    Enums: {
      appointment_status:
        "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
      whatsapp_message_status: "simulated" | "sent" | "failed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      appointment_status: [
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
      ],
      whatsapp_message_status: ["simulated", "sent", "failed"],
    },
  },
} as const;
