export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          logo_url: string | null
          review_mode: boolean
          default_country_code: string
          phone: string | null
          address_street: string | null
          address_city: string | null
          address_province: string | null
          address_postal_code: string | null
          address_country: string
          credits_divisor: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          logo_url?: string | null
          review_mode?: boolean
          default_country_code?: string
          phone?: string | null
          address_street?: string | null
          address_city?: string | null
          address_province?: string | null
          address_postal_code?: string | null
          address_country?: string
          credits_divisor?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          logo_url?: string | null
          review_mode?: boolean
          default_country_code?: string
          phone?: string | null
          address_street?: string | null
          address_city?: string | null
          address_province?: string | null
          address_postal_code?: string | null
          address_country?: string
          credits_divisor?: number
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          org_id: string
          email: string
          name: string
          role: string
          photo_url: string | null
          phone: string | null
          created_at: string
        }
        Insert: {
          id: string
          org_id: string
          email: string
          name: string
          role?: string
          photo_url?: string | null
          phone?: string | null
          created_at?: string
        }
        Update: {
          org_id?: string
          email?: string
          name?: string
          role?: string
          photo_url?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          id: string
          org_id: string
          name: string
          phone: string
          email: string | null
          photo_url: string | null
          department: string | null
          departments: string[]
          notes: string | null
          ktp_nik: string | null
          ktp_photo_url: string | null
          kk_photo_url: string | null
          address: string | null
          date_of_birth: string | null
          slug: string
          access_token: string
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          phone: string
          email?: string | null
          photo_url?: string | null
          department?: string | null
          departments?: string[]
          notes?: string | null
          ktp_nik?: string | null
          ktp_photo_url?: string | null
          kk_photo_url?: string | null
          address?: string | null
          date_of_birth?: string | null
          slug: string
          access_token: string
          created_at?: string
        }
        Update: {
          name?: string
          phone?: string
          email?: string | null
          photo_url?: string | null
          department?: string | null
          departments?: string[]
          notes?: string | null
          ktp_nik?: string | null
          ktp_photo_url?: string | null
          kk_photo_url?: string | null
          address?: string | null
          date_of_birth?: string | null
          slug?: string
          access_token?: string
        }
        Relationships: []
      }
      sop_categories: {
        Row: {
          id: string
          org_id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          sort_order: number
        }
        Update: {
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      sops: {
        Row: {
          id: string
          org_id: string
          employee_id: string | null
          title: string
          content_markdown: string
          content_markdown_id: string | null
          current_version: number
          status: 'active' | 'draft' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          employee_id?: string | null
          title: string
          content_markdown: string
          content_markdown_id?: string | null
          current_version?: number
          status?: 'active' | 'draft' | 'archived'
          created_at?: string
          updated_at?: string
        }
        Update: {
          employee_id?: string | null
          title?: string
          content_markdown?: string
          content_markdown_id?: string | null
          current_version?: number
          status?: 'active' | 'draft' | 'archived'
          updated_at?: string
        }
        Relationships: []
      }
      sop_versions: {
        Row: {
          id: string
          sop_id: string
          version_number: number
          content_markdown: string
          change_summary: string | null
          changed_by: string
          created_at: string
        }
        Insert: {
          id?: string
          sop_id: string
          version_number: number
          content_markdown: string
          change_summary?: string | null
          changed_by: string
          created_at?: string
        }
        Update: {
          change_summary?: string | null
        }
        Relationships: []
      }
      sop_signatures: {
        Row: {
          id: string
          sop_id: string
          version_number: number
          employee_id: string
          typed_name: string
          signature_font: string | null
          signed_at: string
        }
        Insert: {
          id?: string
          sop_id: string
          version_number: number
          employee_id: string
          typed_name: string
          signature_font?: string | null
          signed_at?: string
        }
        Update: {
          id?: string
        }
        Relationships: []
      }
      pending_updates: {
        Row: {
          id: string
          org_id: string
          employee_id: string | null
          employee_identifier: string
          proposed_changes: Record<string, unknown>
          source_meeting: string | null
          status: 'pending' | 'approved' | 'rejected' | 'auto_applied'
          reviewed_by: string | null
          created_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          employee_id?: string | null
          employee_identifier: string
          proposed_changes: Record<string, unknown>
          source_meeting?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'auto_applied'
          reviewed_by?: string | null
          created_at?: string
          resolved_at?: string | null
        }
        Update: {
          employee_id?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'auto_applied'
          reviewed_by?: string | null
          resolved_at?: string | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          id: string
          org_id: string
          key_hash: string
          key_prefix: string
          name: string
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          key_hash: string
          key_prefix: string
          name: string
          created_at?: string
          last_used_at?: string | null
        }
        Update: {
          name?: string
          last_used_at?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          org_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          created_at?: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      sop_tags: {
        Row: {
          sop_id: string
          tag_id: string
        }
        Insert: {
          sop_id: string
          tag_id: string
        }
        Update: {
          sop_id?: string
          tag_id?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          id: string
          org_id: string
          employee_id: string | null
          title: string
          content_markdown: string
          content_markdown_id: string | null
          current_version: number
          status: 'active' | 'draft' | 'archived'
          base_wage_idr: number | null
          allowance_idr: number | null
          hours_per_day: number | null
          days_per_week: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          employee_id?: string | null
          title: string
          content_markdown: string
          content_markdown_id?: string | null
          current_version?: number
          status?: 'active' | 'draft' | 'archived'
          base_wage_idr?: number | null
          allowance_idr?: number | null
          hours_per_day?: number | null
          days_per_week?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          employee_id?: string | null
          title?: string
          content_markdown?: string
          content_markdown_id?: string | null
          current_version?: number
          status?: 'active' | 'draft' | 'archived'
          base_wage_idr?: number | null
          allowance_idr?: number | null
          hours_per_day?: number | null
          days_per_week?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      contract_versions: {
        Row: {
          id: string
          contract_id: string
          version_number: number
          content_markdown: string
          content_markdown_id: string | null
          change_summary: string | null
          changed_by: string
          created_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          version_number: number
          content_markdown: string
          content_markdown_id?: string | null
          change_summary?: string | null
          changed_by: string
          created_at?: string
        }
        Update: {
          change_summary?: string | null
        }
        Relationships: []
      }
      contract_tags: {
        Row: {
          contract_id: string
          tag_id: string
        }
        Insert: {
          contract_id: string
          tag_id: string
        }
        Update: {
          contract_id?: string
          tag_id?: string
        }
        Relationships: []
      }
      contract_signatures: {
        Row: {
          id: string
          contract_id: string
          version_number: number
          employee_id: string
          typed_name: string
          signature_font: string | null
          signed_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          version_number: number
          employee_id: string
          typed_name: string
          signature_font?: string | null
          signed_at?: string
        }
        Update: {
          typed_name?: string
          signature_font?: string | null
        }
        Relationships: []
      }
      feed_events: {
        Row: {
          id: string
          org_id: string
          employee_id: string | null
          event_type: string
          title: string
          description: string | null
          metadata: Record<string, unknown>
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          employee_id?: string | null
          event_type: string
          title: string
          description?: string | null
          metadata?: Record<string, unknown>
          created_at?: string
        }
        Update: {
          title?: string
          description?: string | null
          metadata?: Record<string, unknown>
        }
        Relationships: []
      }
      allowance_adjustments: {
        Row: {
          id: string
          org_id: string
          employee_id: string
          period_month: string
          amount_idr: number
          reason: string
          awarded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          employee_id: string
          period_month?: string
          amount_idr: number
          reason: string
          awarded_by: string
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      credit_adjustments: {
        Row: {
          id: string
          org_id: string
          employee_id: string
          period_month: string
          amount: number
          reason: string
          awarded_by: string
          payout_idr: number | null
          paid_out_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          employee_id: string
          period_month?: string
          amount: number
          reason: string
          awarded_by: string
          payout_idr?: number | null
          paid_out_at?: string | null
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      achievement_definitions: {
        Row: {
          id: string
          org_id: string
          name: string
          description: string | null
          icon: string | null
          trigger_type: 'manual' | 'auto'
          trigger_rule: Record<string, unknown> | null
          is_featured: boolean
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          description?: string | null
          icon?: string | null
          trigger_type: 'manual' | 'auto'
          trigger_rule?: Record<string, unknown> | null
          is_featured?: boolean
          is_active?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          icon?: string | null
          trigger_type?: 'manual' | 'auto'
          trigger_rule?: Record<string, unknown> | null
          is_featured?: boolean
          is_active?: boolean
        }
        Relationships: []
      }
      achievement_unlocks: {
        Row: {
          id: string
          employee_id: string
          achievement_id: string
          unlocked_at: string
          awarded_by: string | null
          reason: string | null
        }
        Insert: {
          id?: string
          employee_id: string
          achievement_id: string
          unlocked_at?: string
          awarded_by?: string | null
          reason?: string | null
        }
        Update: never
        Relationships: []
      }
      org_invitations: {
        Row: {
          id: string
          org_id: string
          email: string
          token: string
          role: string
          invited_by: string | null
          status: 'pending' | 'accepted' | 'revoked' | 'expired'
          expires_at: string
          created_at: string
          accepted_at: string | null
          accepted_by: string | null
        }
        Insert: {
          id?: string
          org_id: string
          email: string
          token: string
          role?: string
          invited_by?: string | null
          status?: 'pending' | 'accepted' | 'revoked' | 'expired'
          expires_at?: string
          created_at?: string
          accepted_at?: string | null
          accepted_by?: string | null
        }
        Update: {
          email?: string
          role?: string
          status?: 'pending' | 'accepted' | 'revoked' | 'expired'
          expires_at?: string
          accepted_at?: string | null
          accepted_by?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      handle_signup: {
        Args: {
          user_id: string
          user_email: string
          user_name: string
          org_name: string
          invite_token?: string | null
        }
        Returns: string
      }
      admin_update_user_role: {
        Args: {
          target_user_id: string
          new_role: 'admin' | 'manager'
        }
        Returns: void
      }
      current_period_month: {
        Args: Record<string, never>
        Returns: string
      }
      close_credit_period: {
        Args: {
          target_employee_id: string
          target_period_month: string
        }
        Returns: number
      }
      portal_home: {
        Args: {
          emp_slug: string
          emp_token: string
        }
        Returns: Record<string, unknown>
      }
      portal_leaderboard: {
        Args: {
          emp_slug: string
          emp_token: string
          period_kind?: 'month' | 'quarter' | 'all-time'
        }
        Returns: Record<string, unknown>
      }
    }
    Enums: Record<string, never>
  }
}

// Convenience type aliases
export type Organization = Database['public']['Tables']['organizations']['Row']
export type User = Database['public']['Tables']['users']['Row']
export type Employee = Database['public']['Tables']['employees']['Row']
export type SopCategory = Database['public']['Tables']['sop_categories']['Row']
export type Sop = Database['public']['Tables']['sops']['Row']
export type SopVersion = Database['public']['Tables']['sop_versions']['Row']
export type SopSignature = Database['public']['Tables']['sop_signatures']['Row']
export type PendingUpdate = Database['public']['Tables']['pending_updates']['Row']
export type ApiKey = Database['public']['Tables']['api_keys']['Row']
export type Tag = Database['public']['Tables']['tags']['Row']
export type Contract = Database['public']['Tables']['contracts']['Row']
export type ContractVersion = Database['public']['Tables']['contract_versions']['Row']
export type FeedEvent = Database['public']['Tables']['feed_events']['Row']
export type OrgInvitation = Database['public']['Tables']['org_invitations']['Row']
export type ContractSignature = Database['public']['Tables']['contract_signatures']['Row']
export type AllowanceAdjustment = Database['public']['Tables']['allowance_adjustments']['Row']
export type CreditAdjustment = Database['public']['Tables']['credit_adjustments']['Row']
export type AchievementDefinition = Database['public']['Tables']['achievement_definitions']['Row']
export type AchievementUnlock = Database['public']['Tables']['achievement_unlocks']['Row']
