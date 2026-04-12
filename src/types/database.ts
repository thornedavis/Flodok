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
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          logo_url?: string | null
          review_mode?: boolean
          default_country_code?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          logo_url?: string | null
          review_mode?: boolean
          default_country_code?: string
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
          created_at: string
        }
        Insert: {
          id: string
          org_id: string
          email: string
          name: string
          role?: string
          created_at?: string
        }
        Update: {
          org_id?: string
          email?: string
          name?: string
          role?: string
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
          employee_id: string
          title: string
          content_markdown: string
          current_version: number
          status: 'active' | 'draft' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          employee_id: string
          title: string
          content_markdown: string
          current_version?: number
          status?: 'active' | 'draft' | 'archived'
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          content_markdown?: string
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
          signed_at: string
        }
        Insert: {
          id?: string
          sop_id: string
          version_number: number
          employee_id: string
          typed_name: string
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
    }
    Views: Record<string, never>
    Functions: {
      handle_signup: {
        Args: {
          user_id: string
          user_email: string
          user_name: string
          org_name: string
        }
        Returns: string
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
