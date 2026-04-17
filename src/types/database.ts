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
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          logo_url?: string | null
          review_mode?: boolean
          default_country_code?: string
          phone?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          logo_url?: string | null
          review_mode?: boolean
          default_country_code?: string
          phone?: string | null
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
          notes: string | null
          ktp_nik: string | null
          address: string | null
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
          notes?: string | null
          ktp_nik?: string | null
          address?: string | null
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
          notes?: string | null
          ktp_nik?: string | null
          address?: string | null
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
