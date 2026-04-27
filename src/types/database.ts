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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      achievement_definitions: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          name: string
          org_id: string
          trigger_rule: Json | null
          trigger_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name: string
          org_id: string
          trigger_rule?: Json | null
          trigger_type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name?: string
          org_id?: string
          trigger_rule?: Json | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievement_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      achievement_unlocks: {
        Row: {
          achievement_id: string
          awarded_by: string | null
          employee_id: string
          id: string
          reason: string | null
          unlocked_at: string
        }
        Insert: {
          achievement_id: string
          awarded_by?: string | null
          employee_id: string
          id?: string
          reason?: string | null
          unlocked_at?: string
        }
        Update: {
          achievement_id?: string
          awarded_by?: string | null
          employee_id?: string
          id?: string
          reason?: string | null
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievement_unlocks_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievement_unlocks_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievement_unlocks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      allowance_adjustments: {
        Row: {
          amount_idr: number
          awarded_by: string
          created_at: string
          employee_id: string
          id: string
          org_id: string
          period_month: string
          reason: string
        }
        Insert: {
          amount_idr: number
          awarded_by: string
          created_at?: string
          employee_id: string
          id?: string
          org_id: string
          period_month?: string
          reason: string
        }
        Update: {
          amount_idr?: number
          awarded_by?: string
          created_at?: string
          employee_id?: string
          id?: string
          org_id?: string
          period_month?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "allowance_adjustments_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowance_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowance_adjustments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_adjustments: {
        Row: {
          amount_idr: number
          awarded_by: string
          created_at: string
          employee_id: string
          id: string
          org_id: string
          paid_out_at: string | null
          payout_idr: number | null
          period_month: string
          reason: string
        }
        Insert: {
          amount_idr: number
          awarded_by: string
          created_at?: string
          employee_id: string
          id?: string
          org_id: string
          paid_out_at?: string | null
          payout_idr?: number | null
          period_month?: string
          reason: string
        }
        Update: {
          amount_idr?: number
          awarded_by?: string
          created_at?: string
          employee_id?: string
          id?: string
          org_id?: string
          paid_out_at?: string | null
          payout_idr?: number | null
          period_month?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_adjustments_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_adjustments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          contract_id: string
          employee_id: string
          id: string
          signature_font: string | null
          signed_at: string
          typed_name: string
          version_number: number
        }
        Insert: {
          contract_id: string
          employee_id: string
          id?: string
          signature_font?: string | null
          signed_at?: string
          typed_name: string
          version_number: number
        }
        Update: {
          contract_id?: string
          employee_id?: string
          id?: string
          signature_font?: string | null
          signed_at?: string
          typed_name?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "contract_tags_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_versions: {
        Row: {
          allowance_idr: number | null
          base_wage_idr: number | null
          change_summary: string | null
          changed_by: string
          content_markdown: string
          content_markdown_id: string | null
          contract_id: string
          created_at: string
          days_per_week: number | null
          employee_id: string | null
          hours_per_day: number | null
          id: string
          resolved_markdown_en: string | null
          resolved_markdown_id: string | null
          translation_error: string | null
          translation_status: string
          version_number: number
        }
        Insert: {
          allowance_idr?: number | null
          base_wage_idr?: number | null
          change_summary?: string | null
          changed_by: string
          content_markdown: string
          content_markdown_id?: string | null
          contract_id: string
          created_at?: string
          days_per_week?: number | null
          employee_id?: string | null
          hours_per_day?: number | null
          id?: string
          resolved_markdown_en?: string | null
          resolved_markdown_id?: string | null
          translation_error?: string | null
          translation_status?: string
          version_number: number
        }
        Update: {
          allowance_idr?: number | null
          base_wage_idr?: number | null
          change_summary?: string | null
          changed_by?: string
          content_markdown?: string
          content_markdown_id?: string | null
          contract_id?: string
          created_at?: string
          days_per_week?: number | null
          employee_id?: string | null
          hours_per_day?: number | null
          id?: string
          resolved_markdown_en?: string | null
          resolved_markdown_id?: string | null
          translation_error?: string | null
          translation_status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_versions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          allowance_idr: number | null
          base_wage_idr: number | null
          content_markdown: string
          content_markdown_id: string | null
          created_at: string
          current_version: number
          days_per_week: number | null
          employee_id: string | null
          hours_per_day: number | null
          id: string
          org_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          allowance_idr?: number | null
          base_wage_idr?: number | null
          content_markdown?: string
          content_markdown_id?: string | null
          created_at?: string
          current_version?: number
          days_per_week?: number | null
          employee_id?: string | null
          hours_per_day?: number | null
          id?: string
          org_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          allowance_idr?: number | null
          base_wage_idr?: number | null
          content_markdown?: string
          content_markdown_id?: string | null
          created_at?: string
          current_version?: number
          days_per_week?: number | null
          employee_id?: string | null
          hours_per_day?: number | null
          id?: string
          org_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_adjustments: {
        Row: {
          amount: number
          awarded_by: string
          created_at: string
          employee_id: string
          id: string
          org_id: string
          paid_out_at: string | null
          payout_idr: number | null
          period_month: string
          reason: string
        }
        Insert: {
          amount: number
          awarded_by: string
          created_at?: string
          employee_id: string
          id?: string
          org_id: string
          paid_out_at?: string | null
          payout_idr?: number | null
          period_month?: string
          reason: string
        }
        Update: {
          amount?: number
          awarded_by?: string
          created_at?: string
          employee_id?: string
          id?: string
          org_id?: string
          paid_out_at?: string | null
          payout_idr?: number | null
          period_month?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_adjustments_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_adjustments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          access_token: string
          address: string | null
          created_at: string
          date_of_birth: string | null
          department: string | null
          departments: string[]
          email: string | null
          id: string
          kk_photo_url: string | null
          ktp_nik: string | null
          ktp_photo_url: string | null
          name: string
          notes: string | null
          org_id: string
          phone: string
          photo_url: string | null
          slug: string
        }
        Insert: {
          access_token: string
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          departments?: string[]
          email?: string | null
          id?: string
          kk_photo_url?: string | null
          ktp_nik?: string | null
          ktp_photo_url?: string | null
          name: string
          notes?: string | null
          org_id: string
          phone: string
          photo_url?: string | null
          slug: string
        }
        Update: {
          access_token?: string
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          departments?: string[]
          email?: string | null
          id?: string
          kk_photo_url?: string | null
          ktp_nik?: string | null
          ktp_photo_url?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string
          photo_url?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_events: {
        Row: {
          created_at: string
          description: string | null
          employee_id: string | null
          event_type: string
          id: string
          metadata: Json | null
          org_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          employee_id?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          org_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          employee_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_integrations: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          credentials_encrypted: string
          id: string
          last_error: string | null
          last_verified_at: string | null
          org_id: string
          provider: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          credentials_encrypted: string
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          org_id: string
          provider: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          credentials_encrypted?: string
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          org_id?: string
          provider?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_integrations_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          at: string
          changed_fields: string[] | null
          detail: Json | null
          id: string
          integration_id: string | null
          org_id: string
          provider: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          at?: string
          changed_fields?: string[] | null
          detail?: Json | null
          id?: string
          integration_id?: string | null
          org_id: string
          provider: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          at?: string
          changed_fields?: string[] | null
          detail?: Json | null
          id?: string
          integration_id?: string | null
          org_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_integrations_audit_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_integrations_audit_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "org_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_integrations_audit_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "org_integrations_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_integrations_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: string
          status?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_city: string | null
          address_country: string
          address_postal_code: string | null
          address_province: string | null
          address_street: string | null
          created_at: string
          credits_divisor: number
          default_country_code: string
          id: string
          logo_url: string | null
          name: string
          pay_day_of_month: number
          phone: string | null
          review_mode: boolean
        }
        Insert: {
          address_city?: string | null
          address_country?: string
          address_postal_code?: string | null
          address_province?: string | null
          address_street?: string | null
          created_at?: string
          credits_divisor?: number
          default_country_code?: string
          id?: string
          logo_url?: string | null
          name: string
          pay_day_of_month?: number
          phone?: string | null
          review_mode?: boolean
        }
        Update: {
          address_city?: string | null
          address_country?: string
          address_postal_code?: string | null
          address_province?: string | null
          address_street?: string | null
          created_at?: string
          credits_divisor?: number
          default_country_code?: string
          id?: string
          logo_url?: string | null
          name?: string
          pay_day_of_month?: number
          phone?: string | null
          review_mode?: boolean
        }
        Relationships: []
      }
      pending_updates: {
        Row: {
          created_at: string
          employee_id: string | null
          employee_identifier: string
          id: string
          org_id: string
          proposed_changes: Json
          resolved_at: string | null
          reviewed_by: string | null
          source_meeting: string | null
          status: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          employee_identifier: string
          id?: string
          org_id: string
          proposed_changes: Json
          resolved_at?: string | null
          reviewed_by?: string | null
          source_meeting?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          employee_identifier?: string
          id?: string
          org_id?: string
          proposed_changes?: Json
          resolved_at?: string | null
          reviewed_by?: string | null
          source_meeting?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_updates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_updates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_updates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_meetings: {
        Row: {
          detail: Json | null
          external_id: string
          org_id: string
          processed_at: string
          provider: string
          status: string
        }
        Insert: {
          detail?: Json | null
          external_id: string
          org_id: string
          processed_at?: string
          provider: string
          status?: string
        }
        Update: {
          detail?: Json | null
          external_id?: string
          org_id?: string
          processed_at?: string
          provider?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "processed_meetings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_logs: {
        Row: {
          employees_matched: number
          errors: Json | null
          external_id: string
          id: string
          meeting_date: string | null
          meeting_title: string | null
          org_id: string
          processed_at: string
          provider: string
          sop_updates_sent: number
          tasks_created: number
          unmatched_items: number
        }
        Insert: {
          employees_matched?: number
          errors?: Json | null
          external_id: string
          id?: string
          meeting_date?: string | null
          meeting_title?: string | null
          org_id: string
          processed_at?: string
          provider: string
          sop_updates_sent?: number
          tasks_created?: number
          unmatched_items?: number
        }
        Update: {
          employees_matched?: number
          errors?: Json | null
          external_id?: string
          id?: string
          meeting_date?: string | null
          meeting_title?: string | null
          org_id?: string
          processed_at?: string
          provider?: string
          sop_updates_sent?: number
          tasks_created?: number
          unmatched_items?: number
        }
        Relationships: [
          {
            foreignKeyName: "processing_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_categories: {
        Row: {
          id: string
          name: string
          org_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          org_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_signatures: {
        Row: {
          employee_id: string
          id: string
          signature_font: string | null
          signed_at: string
          sop_id: string
          typed_name: string
          version_number: number
        }
        Insert: {
          employee_id: string
          id?: string
          signature_font?: string | null
          signed_at?: string
          sop_id: string
          typed_name: string
          version_number: number
        }
        Update: {
          employee_id?: string
          id?: string
          signature_font?: string | null
          signed_at?: string
          sop_id?: string
          typed_name?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_signatures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_signatures_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sops"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "sop_tags_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_versions: {
        Row: {
          change_summary: string | null
          changed_by: string
          content_markdown: string
          content_markdown_id: string | null
          created_at: string
          id: string
          resolved_markdown_en: string | null
          resolved_markdown_id: string | null
          sop_id: string
          translation_error: string | null
          translation_status: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          changed_by: string
          content_markdown: string
          content_markdown_id?: string | null
          created_at?: string
          id?: string
          resolved_markdown_en?: string | null
          resolved_markdown_id?: string | null
          sop_id: string
          translation_error?: string | null
          translation_status?: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          changed_by?: string
          content_markdown?: string
          content_markdown_id?: string | null
          created_at?: string
          id?: string
          resolved_markdown_en?: string | null
          resolved_markdown_id?: string | null
          sop_id?: string
          translation_error?: string | null
          translation_status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_versions_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sops"
            referencedColumns: ["id"]
          },
        ]
      }
      sops: {
        Row: {
          content_markdown: string
          content_markdown_id: string | null
          created_at: string
          current_version: number
          employee_id: string | null
          id: string
          org_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content_markdown?: string
          content_markdown_id?: string | null
          created_at?: string
          current_version?: number
          employee_id?: string | null
          id?: string
          org_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content_markdown?: string
          content_markdown_id?: string | null
          created_at?: string
          current_version?: number
          employee_id?: string | null
          id?: string
          org_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sops_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sops_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          org_id: string
          phone: string | null
          photo_url: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          org_id: string
          phone?: string | null
          photo_url?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          org_id?: string
          phone?: string | null
          photo_url?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      org_integrations_public: {
        Row: {
          config: Json | null
          created_at: string | null
          created_by: string | null
          has_credentials: boolean | null
          id: string | null
          last_error: string | null
          last_verified_at: string | null
          org_id: string | null
          provider: string | null
          status: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          has_credentials?: never
          id?: string | null
          last_error?: string | null
          last_verified_at?: string | null
          org_id?: string | null
          provider?: string | null
          status?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          has_credentials?: never
          id?: string | null
          last_error?: string | null
          last_verified_at?: string | null
          org_id?: string | null
          provider?: string | null
          status?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "org_integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_rewards_roster: { Args: never; Returns: Json }
      admin_update_user_role: {
        Args: { new_role: string; target_user_id: string }
        Returns: undefined
      }
      auto_close_periods: { Args: never; Returns: Json }
      cleanup_processed_meetings: {
        Args: { retention_days?: number }
        Returns: number
      }
      close_period: {
        Args: { target_employee_id: string; target_period_month: string }
        Returns: number
      }
      current_period_month: { Args: never; Returns: string }
      deduct_credits_cascade: {
        Args: {
          deduction_credits: number
          reason: string
          target_employee_id: string
        }
        Returns: Json
      }
      get_user_org_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      handle_signup:
        | {
            Args: {
              org_name: string
              user_email: string
              user_id: string
              user_name: string
            }
            Returns: string
          }
        | {
            Args: {
              invite_token?: string
              org_name: string
              user_email: string
              user_id: string
              user_name: string
            }
            Returns: string
          }
      portal_home: {
        Args: { emp_slug: string; emp_token: string }
        Returns: Json
      }
      portal_leaderboard: {
        Args: { emp_slug: string; emp_token: string; period_kind?: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

// Convenience aliases — keep one per surfaced table so call sites can
// `import type { Employee }` rather than spelling out the Database lookup.
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
export type BonusAdjustment = Database['public']['Tables']['bonus_adjustments']['Row']
export type AchievementDefinition = Database['public']['Tables']['achievement_definitions']['Row']
export type AchievementUnlock = Database['public']['Tables']['achievement_unlocks']['Row']
