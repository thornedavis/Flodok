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
      company_branches: {
        Row: {
          address_city: string | null
          address_country: string
          address_postal_code: string | null
          address_province: string | null
          address_street: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_headquarters: boolean
          name: string
          org_id: string
          parent_branch_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_country?: string
          address_postal_code?: string | null
          address_province?: string | null
          address_street?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_headquarters?: boolean
          name: string
          org_id: string
          parent_branch_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_country?: string
          address_postal_code?: string | null
          address_province?: string | null
          address_street?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_headquarters?: boolean
          name?: string
          org_id?: string
          parent_branch_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_branches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_branches_parent_branch_id_fkey"
            columns: ["parent_branch_id"]
            isOneToOne: false
            referencedRelation: "company_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      company_departments: {
        Row: {
          created_at: string
          display_order: number
          id: string
          manager_employee_id: string | null
          name: string
          org_id: string
          parent_department_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          manager_employee_id?: string | null
          name: string
          org_id: string
          parent_department_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          manager_employee_id?: string | null
          name?: string
          org_id?: string
          parent_department_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_departments_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "company_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      company_reference_values: {
        Row: {
          created_at: string
          display_order: number
          id: string
          kind: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          kind: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          kind?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_reference_values_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          consent_text: string | null
          contract_id: string
          document_hash: string | null
          employee_id: string | null
          id: string
          ip_address: string | null
          signature_font: string | null
          signed_at: string
          signer_email: string | null
          signer_phone: string | null
          signer_role: string
          signer_title: string | null
          signer_user_id: string | null
          typed_name: string
          user_agent: string | null
          version_number: number
        }
        Insert: {
          consent_text?: string | null
          contract_id: string
          document_hash?: string | null
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          signature_font?: string | null
          signed_at?: string
          signer_email?: string | null
          signer_phone?: string | null
          signer_role?: string
          signer_title?: string | null
          signer_user_id?: string | null
          typed_name: string
          user_agent?: string | null
          version_number: number
        }
        Update: {
          consent_text?: string | null
          contract_id?: string
          document_hash?: string | null
          employee_id?: string | null
          id?: string
          ip_address?: string | null
          signature_font?: string | null
          signed_at?: string
          signer_email?: string | null
          signer_phone?: string | null
          signer_role?: string
          signer_title?: string | null
          signer_user_id?: string | null
          typed_name?: string
          user_agent?: string | null
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
          {
            foreignKeyName: "contract_signatures_signer_user_id_fkey"
            columns: ["signer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          content_doc: Json | null
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
          content_doc?: Json | null
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
          content_doc?: Json | null
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
          annual_leave_days: number | null
          approved_by: string | null
          base_wage_idr: number | null
          content_doc: Json | null
          content_markdown: string
          content_markdown_id: string | null
          contract_type: string
          created_at: string
          current_version: number
          days_per_week: number | null
          deleted_at: string | null
          deleted_by: string | null
          document_number: string | null
          employee_id: string | null
          end_date: string | null
          hours_per_day: number | null
          id: string
          is_template: boolean
          org_id: string
          owner_department: string | null
          probation_months: number | null
          start_date: string | null
          status: string
          template_for_position: string | null
          title: string
          trashed_with_parent_id: string | null
          updated_at: string
        }
        Insert: {
          allowance_idr?: number | null
          annual_leave_days?: number | null
          approved_by?: string | null
          base_wage_idr?: number | null
          content_doc?: Json | null
          content_markdown?: string
          content_markdown_id?: string | null
          contract_type?: string
          created_at?: string
          current_version?: number
          days_per_week?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_number?: string | null
          employee_id?: string | null
          end_date?: string | null
          hours_per_day?: number | null
          id?: string
          is_template?: boolean
          org_id: string
          owner_department?: string | null
          probation_months?: number | null
          start_date?: string | null
          status?: string
          template_for_position?: string | null
          title: string
          trashed_with_parent_id?: string | null
          updated_at?: string
        }
        Update: {
          allowance_idr?: number | null
          annual_leave_days?: number | null
          approved_by?: string | null
          base_wage_idr?: number | null
          content_doc?: Json | null
          content_markdown?: string
          content_markdown_id?: string | null
          contract_type?: string
          created_at?: string
          current_version?: number
          days_per_week?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_number?: string | null
          employee_id?: string | null
          end_date?: string | null
          hours_per_day?: number | null
          id?: string
          is_template?: boolean
          org_id?: string
          owner_department?: string | null
          probation_months?: number | null
          start_date?: string | null
          status?: string
          template_for_position?: string | null
          title?: string
          trashed_with_parent_id?: string | null
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
      document_templates: {
        Row: {
          allowance_idr: number | null
          annual_leave_days: number | null
          base_wage_idr: number | null
          content_doc: Json | null
          content_markdown: string
          content_markdown_id: string | null
          contract_type: string | null
          created_at: string
          days_per_week: number | null
          hours_per_day: number | null
          id: string
          org_id: string
          probation_months: number | null
          template_for_position: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          allowance_idr?: number | null
          annual_leave_days?: number | null
          base_wage_idr?: number | null
          content_doc?: Json | null
          content_markdown?: string
          content_markdown_id?: string | null
          contract_type?: string | null
          created_at?: string
          days_per_week?: number | null
          hours_per_day?: number | null
          id?: string
          org_id: string
          probation_months?: number | null
          template_for_position?: string | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          allowance_idr?: number | null
          annual_leave_days?: number | null
          base_wage_idr?: number | null
          content_doc?: Json | null
          content_markdown?: string
          content_markdown_id?: string | null
          contract_type?: string | null
          created_at?: string
          days_per_week?: number | null
          hours_per_day?: number | null
          id?: string
          org_id?: string
          probation_months?: number | null
          template_for_position?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_view_prefs: {
        Row: {
          document_id: string
          document_type: string
          updated_at: string
          user_id: string
          view_mode: string
        }
        Insert: {
          document_id: string
          document_type: string
          updated_at?: string
          user_id: string
          view_mode: string
        }
        Update: {
          document_id?: string
          document_type?: string
          updated_at?: string
          user_id?: string
          view_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_view_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_attachments: {
        Row: {
          created_at: string
          employee_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_url: string
          id: string
          kind: string | null
          mime_type: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_url: string
          id?: string
          kind?: string | null
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_url?: string
          id?: string
          kind?: string | null
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_attachments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_custom_fields: {
        Row: {
          created_at: string
          display_order: number
          employee_id: string
          id: string
          label: string
          org_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          employee_id: string
          id?: string
          label: string
          org_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          employee_id?: string
          id?: string
          label?: string
          org_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_custom_fields_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_custom_fields_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_departments: {
        Row: {
          created_at: string
          department_id: string
          employee_id: string
          is_primary: boolean
        }
        Insert: {
          created_at?: string
          department_id: string
          employee_id: string
          is_primary?: boolean
        }
        Update: {
          created_at?: string
          department_id?: string
          employee_id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "company_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_departments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_emergency_contacts: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          name: string
          org_id: string
          phone: string
          relationship: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          name: string
          org_id: string
          phone: string
          relationship: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          name?: string
          org_id?: string
          phone?: string
          relationship?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_emergency_contacts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_emergency_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_family_members: {
        Row: {
          address: string | null
          birthdate: string | null
          created_at: string
          employee_id: string
          full_name: string
          gender: string | null
          id: string
          id_number: string | null
          is_emergency_contact: boolean
          job: string | null
          marital_status: string | null
          org_id: string
          relationship: string
          religion: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          birthdate?: string | null
          created_at?: string
          employee_id: string
          full_name: string
          gender?: string | null
          id?: string
          id_number?: string | null
          is_emergency_contact?: boolean
          job?: string | null
          marital_status?: string | null
          org_id: string
          relationship: string
          religion?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          birthdate?: string | null
          created_at?: string
          employee_id?: string
          full_name?: string
          gender?: string | null
          id?: string
          id_number?: string | null
          is_emergency_contact?: boolean
          job?: string | null
          marital_status?: string | null
          org_id?: string
          relationship?: string
          religion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_family_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_family_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_formal_education: {
        Row: {
          activities: string | null
          certificate_file_url: string | null
          created_at: string
          degree: string
          employee_id: string
          end_year: number | null
          field_of_study: string | null
          grade: string | null
          has_certificate: boolean
          id: string
          institution: string
          org_id: string
          start_year: number | null
          updated_at: string
        }
        Insert: {
          activities?: string | null
          certificate_file_url?: string | null
          created_at?: string
          degree: string
          employee_id: string
          end_year?: number | null
          field_of_study?: string | null
          grade?: string | null
          has_certificate?: boolean
          id?: string
          institution: string
          org_id: string
          start_year?: number | null
          updated_at?: string
        }
        Update: {
          activities?: string | null
          certificate_file_url?: string | null
          created_at?: string
          degree?: string
          employee_id?: string
          end_year?: number | null
          field_of_study?: string | null
          grade?: string | null
          has_certificate?: boolean
          id?: string
          institution?: string
          org_id?: string
          start_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_formal_education_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_formal_education_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_informal_education: {
        Row: {
          activities: string | null
          certificate_file_url: string | null
          created_at: string
          duration: number | null
          duration_type: string | null
          education_name: string
          employee_id: string
          end_date: string | null
          expired_date: string | null
          fee_idr: number | null
          has_certificate: boolean
          held_by: string | null
          id: string
          org_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          activities?: string | null
          certificate_file_url?: string | null
          created_at?: string
          duration?: number | null
          duration_type?: string | null
          education_name: string
          employee_id: string
          end_date?: string | null
          expired_date?: string | null
          fee_idr?: number | null
          has_certificate?: boolean
          held_by?: string | null
          id?: string
          org_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          activities?: string | null
          certificate_file_url?: string | null
          created_at?: string
          duration?: number | null
          duration_type?: string | null
          education_name?: string
          employee_id?: string
          end_date?: string | null
          expired_date?: string | null
          fee_idr?: number | null
          has_certificate?: boolean
          held_by?: string | null
          id?: string
          org_id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_informal_education_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_informal_education_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_working_experience: {
        Row: {
          company: string
          created_at: string
          employee_id: string
          from_date: string | null
          id: string
          job_position: string
          org_id: string
          to_date: string | null
          updated_at: string
        }
        Insert: {
          company: string
          created_at?: string
          employee_id: string
          from_date?: string | null
          id?: string
          job_position: string
          org_id: string
          to_date?: string | null
          updated_at?: string
        }
        Update: {
          company?: string
          created_at?: string
          employee_id?: string
          from_date?: string | null
          id?: string
          job_position?: string
          org_id?: string
          to_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_working_experience_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_working_experience_org_id_fkey"
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
          applied_for_jd_id: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_name: string | null
          blood_type: string | null
          branch_name: string | null
          citizen_id_address: string | null
          class: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          employee_code: string | null
          employment_type: string | null
          first_name: string | null
          gender: string | null
          grade: string | null
          id: string
          job_level: string | null
          job_position: string | null
          join_date: string | null
          kk_photo_url: string | null
          ktp_nik: string | null
          ktp_photo_url: string | null
          last_name: string | null
          last_notifications_seen_at: string | null
          lifecycle_stage: string
          marital_status: string | null
          name: string
          notes: string | null
          npwp: string | null
          org_id: string
          passport_expiry: string | null
          passport_number: string | null
          phone: string
          photo_url: string | null
          place_of_birth: string | null
          postal_code: string | null
          probation_end_date: string | null
          religion: string | null
          resign_date: string | null
          separation_reason: string | null
          separation_type: string | null
          slug: string
          source: string | null
          source_request_id: string | null
          status: string
        }
        Insert: {
          access_token: string
          address?: string | null
          applied_for_jd_id?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          blood_type?: string | null
          branch_name?: string | null
          citizen_id_address?: string | null
          class?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          employee_code?: string | null
          employment_type?: string | null
          first_name?: string | null
          gender?: string | null
          grade?: string | null
          id?: string
          job_level?: string | null
          job_position?: string | null
          join_date?: string | null
          kk_photo_url?: string | null
          ktp_nik?: string | null
          ktp_photo_url?: string | null
          last_name?: string | null
          last_notifications_seen_at?: string | null
          lifecycle_stage?: string
          marital_status?: string | null
          name: string
          notes?: string | null
          npwp?: string | null
          org_id: string
          passport_expiry?: string | null
          passport_number?: string | null
          phone: string
          photo_url?: string | null
          place_of_birth?: string | null
          postal_code?: string | null
          probation_end_date?: string | null
          religion?: string | null
          resign_date?: string | null
          separation_reason?: string | null
          separation_type?: string | null
          slug: string
          source?: string | null
          source_request_id?: string | null
          status?: string
        }
        Update: {
          access_token?: string
          address?: string | null
          applied_for_jd_id?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          blood_type?: string | null
          branch_name?: string | null
          citizen_id_address?: string | null
          class?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          employee_code?: string | null
          employment_type?: string | null
          first_name?: string | null
          gender?: string | null
          grade?: string | null
          id?: string
          job_level?: string | null
          job_position?: string | null
          join_date?: string | null
          kk_photo_url?: string | null
          ktp_nik?: string | null
          ktp_photo_url?: string | null
          last_name?: string | null
          last_notifications_seen_at?: string | null
          lifecycle_stage?: string
          marital_status?: string | null
          name?: string
          notes?: string | null
          npwp?: string | null
          org_id?: string
          passport_expiry?: string | null
          passport_number?: string | null
          phone?: string
          photo_url?: string | null
          place_of_birth?: string | null
          postal_code?: string | null
          probation_end_date?: string | null
          religion?: string | null
          resign_date?: string | null
          separation_reason?: string | null
          separation_type?: string | null
          slug?: string
          source?: string | null
          source_request_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_applied_for_jd_id_fkey"
            columns: ["applied_for_jd_id"]
            isOneToOne: false
            referencedRelation: "job_descriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: false
            referencedRelation: "hiring_requests"
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
      hiring_requests: {
        Row: {
          actioned_at: string | null
          actioned_by: string | null
          allowance_other: string | null
          allowances: string[]
          base_salary_max: number | null
          base_salary_min: number | null
          candidate_employee_id: string | null
          category: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string
          employment_type: string
          expected_hiring_date: string | null
          hiring_manager_id: string
          id: string
          manager_auto_approved: boolean
          manager_decided_at: string | null
          manager_decided_by: string | null
          manager_decision: string | null
          manager_decision_note: string | null
          org_id: string
          other_benefits: string | null
          owner_decided_at: string | null
          owner_decided_by: string | null
          owner_decision: string | null
          owner_decision_note: string | null
          position_name: string
          replacing_employee_id: string | null
          required_qualifications_md: string
          source_of_candidate: string
          source_of_fund: string
          source_of_fund_justification: string | null
          status: string
          submitted_at: string | null
          supporting_reason: string
          updated_at: string
        }
        Insert: {
          actioned_at?: string | null
          actioned_by?: string | null
          allowance_other?: string | null
          allowances?: string[]
          base_salary_max?: number | null
          base_salary_min?: number | null
          candidate_employee_id?: string | null
          category: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id: string
          employment_type: string
          expected_hiring_date?: string | null
          hiring_manager_id: string
          id?: string
          manager_auto_approved?: boolean
          manager_decided_at?: string | null
          manager_decided_by?: string | null
          manager_decision?: string | null
          manager_decision_note?: string | null
          org_id: string
          other_benefits?: string | null
          owner_decided_at?: string | null
          owner_decided_by?: string | null
          owner_decision?: string | null
          owner_decision_note?: string | null
          position_name: string
          replacing_employee_id?: string | null
          required_qualifications_md?: string
          source_of_candidate: string
          source_of_fund: string
          source_of_fund_justification?: string | null
          status?: string
          submitted_at?: string | null
          supporting_reason?: string
          updated_at?: string
        }
        Update: {
          actioned_at?: string | null
          actioned_by?: string | null
          allowance_other?: string | null
          allowances?: string[]
          base_salary_max?: number | null
          base_salary_min?: number | null
          candidate_employee_id?: string | null
          category?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string
          employment_type?: string
          expected_hiring_date?: string | null
          hiring_manager_id?: string
          id?: string
          manager_auto_approved?: boolean
          manager_decided_at?: string | null
          manager_decided_by?: string | null
          manager_decision?: string | null
          manager_decision_note?: string | null
          org_id?: string
          other_benefits?: string | null
          owner_decided_at?: string | null
          owner_decided_by?: string | null
          owner_decision?: string | null
          owner_decision_note?: string | null
          position_name?: string
          replacing_employee_id?: string | null
          required_qualifications_md?: string
          source_of_candidate?: string
          source_of_fund?: string
          source_of_fund_justification?: string | null
          status?: string
          submitted_at?: string | null
          supporting_reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hiring_requests_actioned_by_fkey"
            columns: ["actioned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_requests_candidate_employee_id_fkey"
            columns: ["candidate_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "company_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_requests_hiring_manager_id_fkey"
            columns: ["hiring_manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_requests_manager_decided_by_fkey"
            columns: ["manager_decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_requests_owner_decided_by_fkey"
            columns: ["owner_decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hiring_requests_replacing_employee_id_fkey"
            columns: ["replacing_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_dismissals: {
        Row: {
          created_at: string
          dedupe_key: string
          dismissed_at: string | null
          id: string
          org_id: string
          snoozed_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          dismissed_at?: string | null
          id?: string
          org_id: string
          snoozed_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          dismissed_at?: string | null
          id?: string
          org_id?: string
          snoozed_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_dismissals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_dismissals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_description_signatures: {
        Row: {
          employee_id: string
          id: string
          job_description_id: string
          signature_font: string | null
          signed_at: string
          typed_name: string
          version_number: number
        }
        Insert: {
          employee_id: string
          id?: string
          job_description_id: string
          signature_font?: string | null
          signed_at?: string
          typed_name: string
          version_number: number
        }
        Update: {
          employee_id?: string
          id?: string
          job_description_id?: string
          signature_font?: string | null
          signed_at?: string
          typed_name?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_description_signatures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_description_signatures_job_description_id_fkey"
            columns: ["job_description_id"]
            isOneToOne: false
            referencedRelation: "job_descriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_description_versions: {
        Row: {
          assignee_employee_id: string | null
          change_summary: string | null
          changed_by: string | null
          content_doc: Json | null
          created_at: string
          department_id: string | null
          doc_version: string | null
          effective_date: string | null
          id: string
          job_description_id: string
          job_level: string | null
          reporting_line: string | null
          supervised_team: string | null
          title: string
          version_number: number
          work_location: string | null
        }
        Insert: {
          assignee_employee_id?: string | null
          change_summary?: string | null
          changed_by?: string | null
          content_doc?: Json | null
          created_at?: string
          department_id?: string | null
          doc_version?: string | null
          effective_date?: string | null
          id?: string
          job_description_id: string
          job_level?: string | null
          reporting_line?: string | null
          supervised_team?: string | null
          title: string
          version_number: number
          work_location?: string | null
        }
        Update: {
          assignee_employee_id?: string | null
          change_summary?: string | null
          changed_by?: string | null
          content_doc?: Json | null
          created_at?: string
          department_id?: string | null
          doc_version?: string | null
          effective_date?: string | null
          id?: string
          job_description_id?: string
          job_level?: string | null
          reporting_line?: string | null
          supervised_team?: string | null
          title?: string
          version_number?: number
          work_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_description_versions_assignee_employee_id_fkey"
            columns: ["assignee_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_description_versions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_description_versions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "company_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_description_versions_job_description_id_fkey"
            columns: ["job_description_id"]
            isOneToOne: false
            referencedRelation: "job_descriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_descriptions: {
        Row: {
          archived_at: string | null
          assignee_employee_id: string | null
          content_doc: Json | null
          created_at: string
          created_by: string | null
          current_version: number
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          doc_version: string | null
          effective_date: string | null
          hiring_request_id: string | null
          id: string
          job_level: string | null
          org_id: string
          published_at: string | null
          reporting_line: string | null
          status: string
          supervised_team: string | null
          title: string
          updated_at: string
          work_location: string | null
        }
        Insert: {
          archived_at?: string | null
          assignee_employee_id?: string | null
          content_doc?: Json | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          doc_version?: string | null
          effective_date?: string | null
          hiring_request_id?: string | null
          id?: string
          job_level?: string | null
          org_id: string
          published_at?: string | null
          reporting_line?: string | null
          status?: string
          supervised_team?: string | null
          title: string
          updated_at?: string
          work_location?: string | null
        }
        Update: {
          archived_at?: string | null
          assignee_employee_id?: string | null
          content_doc?: Json | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          doc_version?: string | null
          effective_date?: string | null
          hiring_request_id?: string | null
          id?: string
          job_level?: string | null
          org_id?: string
          published_at?: string | null
          reporting_line?: string | null
          status?: string
          supervised_team?: string | null
          title?: string
          updated_at?: string
          work_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_descriptions_assignee_employee_id_fkey"
            columns: ["assignee_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_descriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_descriptions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "company_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_descriptions_hiring_request_id_fkey"
            columns: ["hiring_request_id"]
            isOneToOne: false
            referencedRelation: "hiring_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_descriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_snapshots: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          org_id: string
          period_end: string
          period_start: string
          period_type: string
          rank: number
          score: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          org_id: string
          period_end: string
          period_start: string
          period_type: string
          rank: number
          score: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          org_id?: string
          period_end?: string
          period_start?: string
          period_type?: string
          rank?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_snapshots_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_acknowledgements: {
        Row: {
          acknowledged_at: string
          employee_id: string
          id: string
          letter_id: string
          signature_font: string | null
          signature_meta: Json | null
          typed_name: string | null
          version_number: number
        }
        Insert: {
          acknowledged_at?: string
          employee_id: string
          id?: string
          letter_id: string
          signature_font?: string | null
          signature_meta?: Json | null
          typed_name?: string | null
          version_number: number
        }
        Update: {
          acknowledged_at?: string
          employee_id?: string
          id?: string
          letter_id?: string
          signature_font?: string | null
          signature_meta?: Json | null
          typed_name?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "letter_acknowledgements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_acknowledgements_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "letters"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_reference_seqs: {
        Row: {
          last_used: number
          org_id: string
          type_code: string
          year: number
        }
        Insert: {
          last_used?: number
          org_id: string
          type_code: string
          year: number
        }
        Update: {
          last_used?: number
          org_id?: string
          type_code?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "letter_reference_seqs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_tags: {
        Row: {
          letter_id: string
          tag_id: string
        }
        Insert: {
          letter_id: string
          tag_id: string
        }
        Update: {
          letter_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "letter_tags_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      letter_versions: {
        Row: {
          change_summary: string | null
          changed_by: string | null
          content_doc: Json | null
          content_markdown: string
          content_markdown_id: string | null
          created_at: string
          id: string
          letter_id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          changed_by?: string | null
          content_doc?: Json | null
          content_markdown?: string
          content_markdown_id?: string | null
          created_at?: string
          id?: string
          letter_id: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          changed_by?: string | null
          content_doc?: Json | null
          content_markdown?: string
          content_markdown_id?: string | null
          created_at?: string
          id?: string
          letter_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "letter_versions_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "letters"
            referencedColumns: ["id"]
          },
        ]
      }
      letters: {
        Row: {
          category: string | null
          content_doc: Json | null
          content_markdown: string
          content_markdown_id: string | null
          created_at: string
          current_version: number
          deleted_at: string | null
          deleted_by: string | null
          employee_id: string | null
          id: string
          is_template: boolean
          issued_at: string | null
          org_id: string
          reference_number: string | null
          requires_acknowledgement: boolean
          response_by_date: string | null
          sender_user_id: string | null
          status: string
          subject: string | null
          title: string
          trashed_with_parent_id: string | null
          type_code: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          content_doc?: Json | null
          content_markdown?: string
          content_markdown_id?: string | null
          created_at?: string
          current_version?: number
          deleted_at?: string | null
          deleted_by?: string | null
          employee_id?: string | null
          id?: string
          is_template?: boolean
          issued_at?: string | null
          org_id: string
          reference_number?: string | null
          requires_acknowledgement?: boolean
          response_by_date?: string | null
          sender_user_id?: string | null
          status?: string
          subject?: string | null
          title: string
          trashed_with_parent_id?: string | null
          type_code?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          content_doc?: Json | null
          content_markdown?: string
          content_markdown_id?: string | null
          created_at?: string
          current_version?: number
          deleted_at?: string | null
          deleted_by?: string | null
          employee_id?: string | null
          id?: string
          is_template?: boolean
          issued_at?: string | null
          org_id?: string
          reference_number?: string | null
          requires_acknowledgement?: boolean
          response_by_date?: string | null
          sender_user_id?: string | null
          status?: string
          subject?: string | null
          title?: string
          trashed_with_parent_id?: string | null
          type_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "letters_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          badges_enabled: boolean
          bonuses_enabled: boolean
          bpjs_ketenagakerjaan_number: string | null
          business_license_number: string | null
          cancel_at_period_end: boolean
          company_email: string | null
          company_registration_number: string | null
          company_size_range: string | null
          created_at: string
          credits_divisor: number
          credits_enabled: boolean
          current_period_end: string | null
          default_country_code: string
          display_name: string | null
          id: string
          industry: string | null
          jkk_rate: string | null
          klu_code: string | null
          letter_reference_prefix: string | null
          logo_url: string | null
          max_bonus_idr: number | null
          max_credit_per_award: number | null
          name: string
          nitku: string | null
          npwp_15: string | null
          npwp_16: string | null
          past_due_since: string | null
          pay_day_of_month: number
          phone: string | null
          plan_tier: string
          review_mode: boolean
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_quantity: number | null
          subscription_status: string | null
          tax_person_name: string | null
          tax_person_npwp_15: string | null
          tax_person_npwp_16: string | null
          taxable_date: string | null
          timezone: string
          website_url: string | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string
          address_postal_code?: string | null
          address_province?: string | null
          address_street?: string | null
          badges_enabled?: boolean
          bonuses_enabled?: boolean
          bpjs_ketenagakerjaan_number?: string | null
          business_license_number?: string | null
          cancel_at_period_end?: boolean
          company_email?: string | null
          company_registration_number?: string | null
          company_size_range?: string | null
          created_at?: string
          credits_divisor?: number
          credits_enabled?: boolean
          current_period_end?: string | null
          default_country_code?: string
          display_name?: string | null
          id?: string
          industry?: string | null
          jkk_rate?: string | null
          klu_code?: string | null
          letter_reference_prefix?: string | null
          logo_url?: string | null
          max_bonus_idr?: number | null
          max_credit_per_award?: number | null
          name: string
          nitku?: string | null
          npwp_15?: string | null
          npwp_16?: string | null
          past_due_since?: string | null
          pay_day_of_month?: number
          phone?: string | null
          plan_tier?: string
          review_mode?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_quantity?: number | null
          subscription_status?: string | null
          tax_person_name?: string | null
          tax_person_npwp_15?: string | null
          tax_person_npwp_16?: string | null
          taxable_date?: string | null
          timezone?: string
          website_url?: string | null
        }
        Update: {
          address_city?: string | null
          address_country?: string
          address_postal_code?: string | null
          address_province?: string | null
          address_street?: string | null
          badges_enabled?: boolean
          bonuses_enabled?: boolean
          bpjs_ketenagakerjaan_number?: string | null
          business_license_number?: string | null
          cancel_at_period_end?: boolean
          company_email?: string | null
          company_registration_number?: string | null
          company_size_range?: string | null
          created_at?: string
          credits_divisor?: number
          credits_enabled?: boolean
          current_period_end?: string | null
          default_country_code?: string
          display_name?: string | null
          id?: string
          industry?: string | null
          jkk_rate?: string | null
          klu_code?: string | null
          letter_reference_prefix?: string | null
          logo_url?: string | null
          max_bonus_idr?: number | null
          max_credit_per_award?: number | null
          name?: string
          nitku?: string | null
          npwp_15?: string | null
          npwp_16?: string | null
          past_due_since?: string | null
          pay_day_of_month?: number
          phone?: string | null
          plan_tier?: string
          review_mode?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_quantity?: number | null
          subscription_status?: string | null
          tax_person_name?: string | null
          tax_person_npwp_15?: string | null
          tax_person_npwp_16?: string | null
          taxable_date?: string | null
          timezone?: string
          website_url?: string | null
        }
        Relationships: []
      }
      pay_adjustments: {
        Row: {
          amount_idr: number
          awarded_by: string
          created_at: string
          employee_id: string
          id: string
          org_id: string
          paid_out_at: string | null
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
          period_month?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_adjustments_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_adjustments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      sop_audience: {
        Row: {
          added_at: string
          added_by: string | null
          branch_id: string | null
          department_id: string | null
          employee_id: string | null
          id: string
          reference_id: string | null
          sop_id: string
          target_type: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          branch_id?: string | null
          department_id?: string | null
          employee_id?: string | null
          id?: string
          reference_id?: string | null
          sop_id: string
          target_type: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          branch_id?: string | null
          department_id?: string | null
          employee_id?: string | null
          id?: string
          reference_id?: string | null
          sop_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_audience_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "company_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_audience_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "company_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_audience_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_audience_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "company_reference_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_audience_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sops"
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
          required_via: string | null
          signature_font: string | null
          signed_at: string
          sop_id: string
          typed_name: string
          version_number: number
        }
        Insert: {
          employee_id: string
          id?: string
          required_via?: string | null
          signature_font?: string | null
          signed_at?: string
          sop_id: string
          typed_name: string
          version_number: number
        }
        Update: {
          employee_id?: string
          id?: string
          required_via?: string | null
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
          content_doc: Json | null
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
          content_doc?: Json | null
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
          content_doc?: Json | null
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
          approved_by: string | null
          content_doc: Json | null
          content_markdown: string
          content_markdown_id: string | null
          created_at: string
          current_version: number
          deleted_at: string | null
          deleted_by: string | null
          document_number: string | null
          employee_id: string | null
          id: string
          org_id: string
          owner_department: string | null
          owner_department_id: string | null
          status: string
          title: string
          trashed_with_parent_id: string | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          content_doc?: Json | null
          content_markdown?: string
          content_markdown_id?: string | null
          created_at?: string
          current_version?: number
          deleted_at?: string | null
          deleted_by?: string | null
          document_number?: string | null
          employee_id?: string | null
          id?: string
          org_id: string
          owner_department?: string | null
          owner_department_id?: string | null
          status?: string
          title: string
          trashed_with_parent_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          content_doc?: Json | null
          content_markdown?: string
          content_markdown_id?: string | null
          created_at?: string
          current_version?: number
          deleted_at?: string | null
          deleted_by?: string | null
          document_number?: string | null
          employee_id?: string | null
          id?: string
          org_id?: string
          owner_department?: string | null
          owner_department_id?: string | null
          status?: string
          title?: string
          trashed_with_parent_id?: string | null
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
          {
            foreignKeyName: "sops_owner_department_id_fkey"
            columns: ["owner_department_id"]
            isOneToOne: false
            referencedRelation: "company_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      spotlight_post_views: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          dismissed_at: string | null
          employee_id: string
          first_seen_at: string | null
          id: string
          post_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          employee_id: string
          first_seen_at?: string | null
          id?: string
          post_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          employee_id?: string
          first_seen_at?: string | null
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spotlight_post_views_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spotlight_post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "spotlight_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      spotlight_posts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          display_mode: string
          effective_from: string | null
          effective_until: string | null
          id: string
          image_url: string | null
          last_republished_at: string | null
          link_label: string | null
          link_url: string | null
          org_id: string
          posted_as_kind: string
          priority: string
          published_at: string | null
          republish_count: number
          requires_acknowledgement: boolean
          status: string
          target_departments: string[]
          target_employee_ids: string[]
          title: string
          updated_at: string
          visibility_scope: string
          what_happened: string
          what_to_do_instead: string
          who_applies_note: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_mode?: string
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          image_url?: string | null
          last_republished_at?: string | null
          link_label?: string | null
          link_url?: string | null
          org_id: string
          posted_as_kind?: string
          priority?: string
          published_at?: string | null
          republish_count?: number
          requires_acknowledgement?: boolean
          status?: string
          target_departments?: string[]
          target_employee_ids?: string[]
          title: string
          updated_at?: string
          visibility_scope?: string
          what_happened: string
          what_to_do_instead: string
          who_applies_note?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_mode?: string
          effective_from?: string | null
          effective_until?: string | null
          id?: string
          image_url?: string | null
          last_republished_at?: string | null
          link_label?: string | null
          link_url?: string | null
          org_id?: string
          posted_as_kind?: string
          priority?: string
          published_at?: string | null
          republish_count?: number
          requires_acknowledgement?: boolean
          status?: string
          target_departments?: string[]
          target_employee_ids?: string[]
          title?: string
          updated_at?: string
          visibility_scope?: string
          what_happened?: string
          what_to_do_instead?: string
          who_applies_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spotlight_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spotlight_posts_org_id_fkey"
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
      translation_cache: {
        Row: {
          created_at: string
          direction: string
          model: string | null
          org_id: string
          source_excerpt: string
          source_hash: string
          translated_content: string
        }
        Insert: {
          created_at?: string
          direction: string
          model?: string | null
          org_id: string
          source_excerpt: string
          source_hash: string
          translated_content: string
        }
        Update: {
          created_at?: string
          direction?: string
          model?: string | null
          org_id?: string
          source_excerpt?: string
          source_hash?: string
          translated_content?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_cache_org_id_fkey"
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
          employee_id: string | null
          id: string
          is_platform_admin: boolean
          name: string
          org_id: string
          phone: string | null
          photo_url: string | null
          role: string
          signature_font: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          email: string
          employee_id?: string | null
          id: string
          is_platform_admin?: boolean
          name: string
          org_id: string
          phone?: string | null
          photo_url?: string | null
          role?: string
          signature_font?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          employee_id?: string | null
          id?: string
          is_platform_admin?: boolean
          name?: string
          org_id?: string
          phone?: string | null
          photo_url?: string | null
          role?: string
          signature_font?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
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
      _trash_assert_caller_authorized: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      _trash_assert_caller_in_org: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      acknowledge_letter: {
        Args: {
          emp_slug: string
          emp_token: string
          p_letter_id: string
          p_signature_font?: string
          p_typed_name?: string
        }
        Returns: {
          acknowledged_at: string
          employee_id: string
          id: string
          letter_id: string
          signature_font: string | null
          signature_meta: Json | null
          typed_name: string | null
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "letter_acknowledgements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_rewards_roster: {
        Args: { all_time?: boolean; target_period_month?: string }
        Returns: Json
      }
      admin_update_user_role: {
        Args: { new_role: string; target_user_id: string }
        Returns: undefined
      }
      archive_job_description: {
        Args: { p_id: string }
        Returns: {
          archived_at: string | null
          assignee_employee_id: string | null
          content_doc: Json | null
          created_at: string
          created_by: string | null
          current_version: number
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          doc_version: string | null
          effective_date: string | null
          hiring_request_id: string | null
          id: string
          job_level: string | null
          org_id: string
          published_at: string | null
          reporting_line: string | null
          status: string
          supervised_team: string | null
          title: string
          updated_at: string
          work_location: string | null
        }
        SetofOptions: {
          from: "*"
          to: "job_descriptions"
          isOneToOne: true
          isSetofReturn: false
        }
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
      delete_branch: { Args: { p_id: string }; Returns: Json }
      delete_department: { Args: { p_id: string }; Returns: Json }
      delete_reference_value: { Args: { p_id: string }; Returns: Json }
      employee_audience_impact: {
        Args: { p_employee_id: string }
        Returns: Json
      }
      employee_in_departments: {
        Args: { p_department_names: string[]; p_employee_id: string }
        Returns: boolean
      }
      empty_trash: { Args: never; Returns: undefined }
      evaluate_first_event_for_employee: {
        Args: { p_employee_id: string }
        Returns: number
      }
      evaluate_leaderboard_achievements_for_period: {
        Args: { p_period_start: string }
        Returns: number
      }
      evaluate_tenure_for_employee: {
        Args: { p_employee_id: string }
        Returns: number
      }
      get_user_org_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      global_search: {
        Args: { max_per_group?: number; q: string }
        Returns: {
          group_key: string
          id: string
          rank: number
          status: string
          subtitle: string
          title: string
          updated_at: string
        }[]
      }
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
      is_department_manager: {
        Args: { p_department_id: string }
        Returns: boolean
      }
      issue_letter: {
        Args: { p_letter_id: string }
        Returns: {
          category: string | null
          content_doc: Json | null
          content_markdown: string
          content_markdown_id: string | null
          created_at: string
          current_version: number
          deleted_at: string | null
          deleted_by: string | null
          employee_id: string | null
          id: string
          is_template: boolean
          issued_at: string | null
          org_id: string
          reference_number: string | null
          requires_acknowledgement: boolean
          response_by_date: string | null
          sender_user_id: string | null
          status: string
          subject: string | null
          title: string
          trashed_with_parent_id: string | null
          type_code: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "letters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_trash: {
        Args: never
        Returns: {
          deleted_at: string
          deleted_by: string
          deleted_by_avatar: string
          deleted_by_name: string
          item_id: string
          item_type: string
          subtitle: string
          title: string
          trashed_with_parent_id: string
        }[]
      }
      manager_decide_hiring_request: {
        Args: { p_approve: boolean; p_note?: string; p_request_id: string }
        Returns: {
          actioned_at: string | null
          actioned_by: string | null
          allowance_other: string | null
          allowances: string[]
          base_salary_max: number | null
          base_salary_min: number | null
          candidate_employee_id: string | null
          category: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string
          employment_type: string
          expected_hiring_date: string | null
          hiring_manager_id: string
          id: string
          manager_auto_approved: boolean
          manager_decided_at: string | null
          manager_decided_by: string | null
          manager_decision: string | null
          manager_decision_note: string | null
          org_id: string
          other_benefits: string | null
          owner_decided_at: string | null
          owner_decided_by: string | null
          owner_decision: string | null
          owner_decision_note: string | null
          position_name: string
          replacing_employee_id: string | null
          required_qualifications_md: string
          source_of_candidate: string
          source_of_fund: string
          source_of_fund_justification: string | null
          status: string
          submitted_at: string | null
          supporting_reason: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hiring_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_hiring_request_actioned: {
        Args: { p_candidate_employee_id: string; p_request_id: string }
        Returns: {
          actioned_at: string | null
          actioned_by: string | null
          allowance_other: string | null
          allowances: string[]
          base_salary_max: number | null
          base_salary_min: number | null
          candidate_employee_id: string | null
          category: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string
          employment_type: string
          expected_hiring_date: string | null
          hiring_manager_id: string
          id: string
          manager_auto_approved: boolean
          manager_decided_at: string | null
          manager_decided_by: string | null
          manager_decision: string | null
          manager_decision_note: string | null
          org_id: string
          other_benefits: string | null
          owner_decided_at: string | null
          owner_decided_by: string | null
          owner_decision: string | null
          owner_decision_note: string | null
          position_name: string
          replacing_employee_id: string | null
          required_qualifications_md: string
          source_of_candidate: string
          source_of_fund: string
          source_of_fund_justification: string | null
          status: string
          submitted_at: string | null
          supporting_reason: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hiring_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_letter_reference_number: {
        Args: { p_org_id: string; p_type_code: string; p_year?: number }
        Returns: string
      }
      owner_decide_hiring_request: {
        Args: { p_approve: boolean; p_note?: string; p_request_id: string }
        Returns: {
          actioned_at: string | null
          actioned_by: string | null
          allowance_other: string | null
          allowances: string[]
          base_salary_max: number | null
          base_salary_min: number | null
          candidate_employee_id: string | null
          category: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string
          employment_type: string
          expected_hiring_date: string | null
          hiring_manager_id: string
          id: string
          manager_auto_approved: boolean
          manager_decided_at: string | null
          manager_decided_by: string | null
          manager_decision: string | null
          manager_decision_note: string | null
          org_id: string
          other_benefits: string | null
          owner_decided_at: string | null
          owner_decided_by: string | null
          owner_decision: string | null
          owner_decision_note: string | null
          position_name: string
          replacing_employee_id: string | null
          required_qualifications_md: string
          source_of_candidate: string
          source_of_fund: string
          source_of_fund_justification: string | null
          status: string
          submitted_at: string | null
          supporting_reason: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hiring_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      portal_badges: {
        Args: { emp_slug: string; emp_token: string }
        Returns: Json
      }
      portal_documents: {
        Args: { emp_slug: string; emp_token: string }
        Returns: Json
      }
      portal_home:
        | { Args: { emp_slug: string; emp_token: string }; Returns: Json }
        | {
            Args: { emp_slug: string; emp_token: string; target_month: string }
            Returns: Json
          }
      portal_leaderboard: {
        Args: { emp_slug: string; emp_token: string; period_kind?: string }
        Returns: Json
      }
      portal_mark_notifications_seen: {
        Args: { emp_slug: string; emp_token: string }
        Returns: undefined
      }
      portal_sign_sop: {
        Args: {
          emp_slug: string
          emp_token: string
          p_signature_font?: string
          p_sop_id: string
          p_typed_name: string
        }
        Returns: {
          employee_id: string
          id: string
          required_via: string | null
          signature_font: string | null
          signed_at: string
          sop_id: string
          typed_name: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "sop_signatures"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      portal_spotlight_acknowledge: {
        Args: { emp_slug: string; emp_token: string; p_post_id: string }
        Returns: undefined
      }
      portal_spotlight_dismiss: {
        Args: { emp_slug: string; emp_token: string; p_post_id: string }
        Returns: undefined
      }
      portal_spotlight_posts: {
        Args: { emp_slug: string; emp_token: string }
        Returns: {
          acknowledged_at: string
          author_name: string
          dismissed_at: string
          display_mode: string
          effective_from: string
          effective_until: string
          first_seen_at: string
          id: string
          image_url: string
          link_label: string
          link_url: string
          priority: string
          published_at: string
          republish_count: number
          requires_acknowledgement: boolean
          title: string
          what_happened: string
          what_to_do_instead: string
          who_applies_note: string
        }[]
      }
      portal_spotlight_seen: {
        Args: { emp_slug: string; emp_token: string; p_post_id: string }
        Returns: undefined
      }
      portal_unread_count: {
        Args: { emp_slug: string; emp_token: string }
        Returns: number
      }
      publish_job_description: {
        Args: { p_id: string }
        Returns: {
          archived_at: string | null
          assignee_employee_id: string | null
          content_doc: Json | null
          created_at: string
          created_by: string | null
          current_version: number
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          doc_version: string | null
          effective_date: string | null
          hiring_request_id: string | null
          id: string
          job_level: string | null
          org_id: string
          published_at: string | null
          reporting_line: string | null
          status: string
          supervised_team: string | null
          title: string
          updated_at: string
          work_location: string | null
        }
        SetofOptions: {
          from: "*"
          to: "job_descriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purge_item: {
        Args: { p_item_id: string; p_item_type: string }
        Returns: undefined
      }
      recent_unlocks: {
        Args: { p_days_back: number }
        Returns: {
          achievement_description: string
          achievement_icon: string
          achievement_id: string
          achievement_name: string
          announced_at: string
          awarded_by: string
          employee_id: string
          employee_name: string
          employee_photo: string
          is_manual: boolean
          reason: string
          unlock_id: string
          unlocked_at: string
        }[]
      }
      republish_spotlight_post: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      restore_item: {
        Args: { p_item_id: string; p_item_type: string }
        Returns: undefined
      }
      run_daily_achievements: {
        Args: never
        Returns: {
          employees_processed: number
          unlocks_awarded: number
        }[]
      }
      run_monthly_leaderboard: {
        Args: { p_period_start?: string }
        Returns: {
          snapshot_rows: number
          unlocks_awarded: number
        }[]
      }
      seed_v1_achievement_definitions: {
        Args: { p_org_id: string }
        Returns: undefined
      }
      sop_resolved_audience: {
        Args: { p_sop_id: string }
        Returns: {
          employee_id: string
        }[]
      }
      sop_signature_progress: { Args: { p_sop_id: string }; Returns: Json }
      spotlight_target_employee_ids: {
        Args: { p_post_id: string }
        Returns: string[]
      }
      submit_hiring_request: {
        Args: { p_request_id: string }
        Returns: {
          actioned_at: string | null
          actioned_by: string | null
          allowance_other: string | null
          allowances: string[]
          base_salary_max: number | null
          base_salary_min: number | null
          candidate_employee_id: string | null
          category: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string
          employment_type: string
          expected_hiring_date: string | null
          hiring_manager_id: string
          id: string
          manager_auto_approved: boolean
          manager_decided_at: string | null
          manager_decided_by: string | null
          manager_decision: string | null
          manager_decision_note: string | null
          org_id: string
          other_benefits: string | null
          owner_decided_at: string | null
          owner_decided_by: string | null
          owner_decision: string | null
          owner_decision_note: string | null
          position_name: string
          replacing_employee_id: string | null
          required_qualifications_md: string
          source_of_candidate: string
          source_of_fund: string
          source_of_fund_justification: string | null
          status: string
          submitted_at: string | null
          supporting_reason: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hiring_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      take_monthly_leaderboard_snapshot: {
        Args: { p_period_start: string }
        Returns: number
      }
      transfer_ownership: {
        Args: { p_target_user_id: string }
        Returns: undefined
      }
      trash_document: {
        Args: { p_doc_id: string; p_doc_type: string }
        Returns: undefined
      }
      trash_employee: {
        Args: { p_cascade_docs?: boolean; p_employee_id: string }
        Returns: undefined
      }
      trash_hiring_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      trash_spotlight_post: { Args: { p_post_id: string }; Returns: undefined }
      upcoming_milestones: {
        Args: { p_days_ahead: number }
        Returns: {
          achievement_description: string
          achievement_icon: string
          achievement_id: string
          achievement_name: string
          employee_id: string
          employee_name: string
          employee_photo: string
          milestone_at: string
        }[]
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
  public: {
    Enums: {},
  },
} as const
