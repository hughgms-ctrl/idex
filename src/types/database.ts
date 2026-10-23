export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          church_id: string
          created_at: string
          data: Json | null
          id: number
          record_id: string | null
          table_name: string
        }
        ComputedFields: never
        Insert: {
          action: string
          actor_id?: string | null
          church_id: string
          created_at?: string
          data?: Json | null
          id?: never
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          church_id?: string
          created_at?: string
          data?: Json | null
          id?: never
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: 'audit_log_church_id_fkey'
            columns: ['church_id']
            isOneToOne: false
            referencedRelation: 'churches'
            referencedColumns: ['id']
          },
        ]
      }
      checkin_requests: {
        Row: {
          adjusted_arrived_at: string | null
          church_id: string
          created_at: string
          declared_arrived_at: string
          event_id: string
          evidence: NonNullable<Json>
          id: string
          ministry_member_id: string
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database['public']['Enums']['request_status']
        }
        ComputedFields: never
        Insert: {
          adjusted_arrived_at?: string | null
          church_id: string
          created_at?: string
          declared_arrived_at: string
          event_id: string
          evidence?: NonNullable<Json>
          id?: string
          ministry_member_id: string
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database['public']['Enums']['request_status']
        }
        Update: {
          adjusted_arrived_at?: string | null
          church_id?: string
          created_at?: string
          declared_arrived_at?: string
          event_id?: string
          evidence?: NonNullable<Json>
          id?: string
          ministry_member_id?: string
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database['public']['Enums']['request_status']
        }
        Relationships: [
          {
            foreignKeyName: 'checkin_requests_event_id_church_id_fkey'
            columns: ['event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'checkin_requests_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'checkin_requests_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      checkins: {
        Row: {
          accuracy_m: number | null
          arrived_at: string
          church_id: string
          created_at: string
          distance_m: number | null
          event_id: string
          id: string
          lat: number | null
          late_minutes: number
          lng: number | null
          ministry_member_id: string
          source: Database['public']['Enums']['checkin_source']
        }
        ComputedFields: never
        Insert: {
          accuracy_m?: number | null
          arrived_at: string
          church_id: string
          created_at?: string
          distance_m?: number | null
          event_id: string
          id?: string
          lat?: number | null
          late_minutes?: number
          lng?: number | null
          ministry_member_id: string
          source?: Database['public']['Enums']['checkin_source']
        }
        Update: {
          accuracy_m?: number | null
          arrived_at?: string
          church_id?: string
          created_at?: string
          distance_m?: number | null
          event_id?: string
          id?: string
          lat?: number | null
          late_minutes?: number
          lng?: number | null
          ministry_member_id?: string
          source?: Database['public']['Enums']['checkin_source']
        }
        Relationships: [
          {
            foreignKeyName: 'checkins_event_id_church_id_fkey'
            columns: ['event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'checkins_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      church_members: {
        Row: {
          church_id: string
          created_at: string
          id: string
          role: Database['public']['Enums']['church_role']
          user_id: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          role?: Database['public']['Enums']['church_role']
          user_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          role?: Database['public']['Enums']['church_role']
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'church_members_church_id_fkey'
            columns: ['church_id']
            isOneToOne: false
            referencedRelation: 'churches'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'church_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      churches: {
        Row: {
          address: string | null
          checkin_radius_m: number
          created_at: string
          created_by: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          address?: string | null
          checkin_radius_m?: number
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          checkin_radius_m?: number
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      cycle_eligibility: {
        Row: {
          balance: number
          church_id: string
          computed_at: string
          cycle_id: string
          eligible: boolean
          id: string
          ministry_id: string
          ministry_member_id: string
        }
        ComputedFields: never
        Insert: {
          balance: number
          church_id: string
          computed_at?: string
          cycle_id: string
          eligible: boolean
          id?: string
          ministry_id: string
          ministry_member_id: string
        }
        Update: {
          balance?: number
          church_id?: string
          computed_at?: string
          cycle_id?: string
          eligible?: boolean
          id?: string
          ministry_id?: string
          ministry_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cycle_eligibility_cycle_id_church_id_fkey'
            columns: ['cycle_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'cycles'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'cycle_eligibility_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'cycle_eligibility_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      cycles: {
        Row: {
          church_id: string
          closed_at: string | null
          created_at: string
          ends_on: string
          id: string
          ministry_id: string
          starts_on: string
          status: Database['public']['Enums']['cycle_status']
        }
        ComputedFields: never
        Insert: {
          church_id: string
          closed_at?: string | null
          created_at?: string
          ends_on: string
          id?: string
          ministry_id: string
          starts_on: string
          status?: Database['public']['Enums']['cycle_status']
        }
        Update: {
          church_id?: string
          closed_at?: string | null
          created_at?: string
          ends_on?: string
          id?: string
          ministry_id?: string
          starts_on?: string
          status?: Database['public']['Enums']['cycle_status']
        }
        Relationships: [
          {
            foreignKeyName: 'cycles_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      events: {
        Row: {
          church_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          kind: Database['public']['Enums']['event_kind']
          lat: number | null
          lng: number | null
          location_name: string | null
          ministry_id: string
          notes: string | null
          radius_m: number | null
          recurrence_parent_id: string | null
          recurrence_rule: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind?: Database['public']['Enums']['event_kind']
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          ministry_id: string
          notes?: string | null
          radius_m?: number | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind?: Database['public']['Enums']['event_kind']
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          ministry_id?: string
          notes?: string | null
          radius_m?: number | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'events_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'events_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'events_recurrence_parent_id_fkey'
            columns: ['recurrence_parent_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
        ]
      }
      invites: {
        Row: {
          church_id: string
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string
          id: string
          max_uses: number
          ministry_id: string
          ministry_role_ids: string[]
          revoked_at: string | null
          role: Database['public']['Enums']['ministry_member_role']
          token: string
          uses_count: number
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          max_uses?: number
          ministry_id: string
          ministry_role_ids?: string[]
          revoked_at?: string | null
          role?: Database['public']['Enums']['ministry_member_role']
          token?: string
          uses_count?: number
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          max_uses?: number
          ministry_id?: string
          ministry_role_ids?: string[]
          revoked_at?: string | null
          role?: Database['public']['Enums']['ministry_member_role']
          token?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: 'invites_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invites_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      justifications: {
        Row: {
          church_id: string
          created_at: string
          event_id: string
          id: string
          kind: Database['public']['Enums']['justification_kind']
          ministry_member_id: string
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database['public']['Enums']['justification_status']
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          event_id: string
          id?: string
          kind: Database['public']['Enums']['justification_kind']
          ministry_member_id: string
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database['public']['Enums']['justification_status']
        }
        Update: {
          church_id?: string
          created_at?: string
          event_id?: string
          id?: string
          kind?: Database['public']['Enums']['justification_kind']
          ministry_member_id?: string
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database['public']['Enums']['justification_status']
        }
        Relationships: [
          {
            foreignKeyName: 'justifications_event_id_church_id_fkey'
            columns: ['event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'justifications_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'justifications_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      member_unavailability: {
        Row: {
          church_id: string
          created_at: string
          ends_at: string
          id: string
          ministry_member_id: string
          reason: string | null
          recurrence_rule: string | null
          starts_at: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          ends_at: string
          id?: string
          ministry_member_id: string
          reason?: string | null
          recurrence_rule?: string | null
          starts_at: string
        }
        Update: {
          church_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          ministry_member_id?: string
          reason?: string | null
          recurrence_rule?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'member_unavailability_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      ministries: {
        Row: {
          church_id: string
          created_at: string
          description: string | null
          id: string
          kind: string
          name: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ministries_church_id_fkey'
            columns: ['church_id']
            isOneToOne: false
            referencedRelation: 'churches'
            referencedColumns: ['id']
          },
        ]
      }
      ministry_member_roles: {
        Row: {
          church_id: string
          created_at: string
          ministry_member_id: string
          ministry_role_id: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          ministry_member_id: string
          ministry_role_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          ministry_member_id?: string
          ministry_role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ministry_member_roles_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'ministry_member_roles_ministry_role_id_church_id_fkey'
            columns: ['ministry_role_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_roles'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      ministry_members: {
        Row: {
          church_id: string
          created_at: string
          id: string
          joined_at: string
          ministry_id: string
          role: Database['public']['Enums']['ministry_member_role']
          status: Database['public']['Enums']['member_status']
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          joined_at?: string
          ministry_id: string
          role?: Database['public']['Enums']['ministry_member_role']
          status?: Database['public']['Enums']['member_status']
          updated_at?: string
          user_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          joined_at?: string
          ministry_id?: string
          role?: Database['public']['Enums']['ministry_member_role']
          status?: Database['public']['Enums']['member_status']
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ministry_members_church_id_user_id_fkey'
            columns: ['church_id', 'user_id']
            isOneToOne: false
            referencedRelation: 'church_members'
            referencedColumns: ['church_id', 'user_id']
          },
          {
            foreignKeyName: 'ministry_members_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'ministry_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      ministry_roles: {
        Row: {
          church_id: string
          created_at: string
          id: string
          ministry_id: string
          name: string
          sort_order: number
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          ministry_id: string
          name: string
          sort_order?: number
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          ministry_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'ministry_roles_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      ministry_settings: {
        Row: {
          absence_penalty: number
          checkin_radius_m: number | null
          checkin_request_deadline_hours: number
          checkin_request_limit_per_cycle: number
          church_id: string
          cycle_min_points: number
          cycle_months: number
          cycle_starting_points: number
          late_penalty_tiers: NonNullable<Json>
          late_tolerance_min: number
          ministry_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          absence_penalty?: number
          checkin_radius_m?: number | null
          checkin_request_deadline_hours?: number
          checkin_request_limit_per_cycle?: number
          church_id: string
          cycle_min_points?: number
          cycle_months?: number
          cycle_starting_points?: number
          late_penalty_tiers?: NonNullable<Json>
          late_tolerance_min?: number
          ministry_id: string
          updated_at?: string
        }
        Update: {
          absence_penalty?: number
          checkin_radius_m?: number | null
          checkin_request_deadline_hours?: number
          checkin_request_limit_per_cycle?: number
          church_id?: string
          cycle_min_points?: number
          cycle_months?: number
          cycle_starting_points?: number
          late_penalty_tiers?: NonNullable<Json>
          late_tolerance_min?: number
          ministry_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ministry_settings_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      point_ledger: {
        Row: {
          checkin_id: string | null
          checkin_request_id: string | null
          church_id: string
          created_at: string
          created_by: string | null
          cycle_id: string
          delta: number
          event_id: string | null
          id: string
          ministry_id: string
          ministry_member_id: string
          note: string | null
          reason: Database['public']['Enums']['point_reason']
        }
        ComputedFields: never
        Insert: {
          checkin_id?: string | null
          checkin_request_id?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          cycle_id: string
          delta: number
          event_id?: string | null
          id?: string
          ministry_id: string
          ministry_member_id: string
          note?: string | null
          reason: Database['public']['Enums']['point_reason']
        }
        Update: {
          checkin_id?: string | null
          checkin_request_id?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          cycle_id?: string
          delta?: number
          event_id?: string | null
          id?: string
          ministry_id?: string
          ministry_member_id?: string
          note?: string | null
          reason?: Database['public']['Enums']['point_reason']
        }
        Relationships: [
          {
            foreignKeyName: 'point_ledger_checkin_id_church_id_fkey'
            columns: ['checkin_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'checkins'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'point_ledger_checkin_request_id_church_id_fkey'
            columns: ['checkin_request_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'checkin_requests'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'point_ledger_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'point_ledger_cycle_id_church_id_fkey'
            columns: ['cycle_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'cycles'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'point_ledger_event_id_church_id_fkey'
            columns: ['event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'point_ledger_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'point_ledger_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quarter_plan_rules: {
        Row: {
          church_id: string
          max_new_songs_per_month: number
          min_weeks_between_repeats: number
          ministry_id: string
          songs_per_service: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          max_new_songs_per_month?: number
          min_weeks_between_repeats?: number
          ministry_id: string
          songs_per_service?: number
          updated_at?: string
        }
        Update: {
          church_id?: string
          max_new_songs_per_month?: number
          min_weeks_between_repeats?: number
          ministry_id?: string
          songs_per_service?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quarter_plan_rules_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      schedule_assignments: {
        Row: {
          church_id: string
          created_at: string
          event_id: string
          id: string
          ministry_member_id: string
          ministry_role_id: string | null
          status: Database['public']['Enums']['assignment_status']
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          event_id: string
          id?: string
          ministry_member_id: string
          ministry_role_id?: string | null
          status?: Database['public']['Enums']['assignment_status']
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          event_id?: string
          id?: string
          ministry_member_id?: string
          ministry_role_id?: string | null
          status?: Database['public']['Enums']['assignment_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'schedule_assignments_event_id_church_id_fkey'
            columns: ['event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'schedule_assignments_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'schedule_assignments_ministry_role_id_church_id_fkey'
            columns: ['ministry_role_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_roles'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      setlist_items: {
        Row: {
          church_id: string
          created_at: string
          id: string
          key: string | null
          notes: string | null
          position: number
          setlist_id: string
          song_id: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          key?: string | null
          notes?: string | null
          position: number
          setlist_id: string
          song_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          key?: string | null
          notes?: string | null
          position?: number
          setlist_id?: string
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'setlist_items_setlist_id_church_id_fkey'
            columns: ['setlist_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'setlists'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'setlist_items_song_id_church_id_fkey'
            columns: ['song_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'songs'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      setlists: {
        Row: {
          church_id: string
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          notes: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'setlists_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'setlists_event_id_church_id_fkey'
            columns: ['event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      songs: {
        Row: {
          artist: string | null
          bpm: number | null
          chordpro: string
          church_id: string
          created_at: string
          created_by: string | null
          id: string
          links: NonNullable<Json>
          ministry_id: string
          original_key: string | null
          tags: string[]
          time_signature: string | null
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          artist?: string | null
          bpm?: number | null
          chordpro?: string
          church_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          links?: NonNullable<Json>
          ministry_id: string
          original_key?: string | null
          tags?: string[]
          time_signature?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          artist?: string | null
          bpm?: number | null
          chordpro?: string
          church_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          links?: NonNullable<Json>
          ministry_id?: string
          original_key?: string | null
          tags?: string[]
          time_signature?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'songs_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'songs_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
    }
    Views: {
      member_cycle_balance: {
        Row: {
          balance: number | null
          church_id: string
          cycle_id: string
          last_entry_at: string | null
          ministry_id: string
          ministry_member_id: string
          penalties: number | null
        }
        ComputedFields: never
        Relationships: [
          {
            foreignKeyName: 'point_ledger_cycle_id_church_id_fkey'
            columns: ['cycle_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'cycles'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'point_ledger_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'point_ledger_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
    }
    Functions: {
      accept_invite: { Args: { p_full_name?: string; p_token: string }; Returns: Json }
      can_edit_setlist: { Args: { p_setlist_id: string }; Returns: boolean }
      can_edit_setlist_of_event: { Args: { p_event_id: string }; Returns: boolean }
      can_justify_event: {
        Args: { p_event_id: string; p_ministry_member_id: string }
        Returns: boolean
      }
      create_church: {
        Args: { p_church_name: string; p_full_name?: string; p_ministry_name?: string }
        Returns: string
      }
      get_invite_preview: {
        Args: { p_token: string }
        Returns: {
          church_name: string
          expires_at: string
          ministry_name: string
          role: Database['public']['Enums']['ministry_member_role']
          status: string
        }[]
      }
      is_church_member: { Args: { p_church_id: string }; Returns: boolean }
      is_church_owner: { Args: { p_church_id: string }; Returns: boolean }
      is_event_leader: { Args: { p_event_id: string }; Returns: boolean }
      is_event_minister: { Args: { p_event_id: string }; Returns: boolean }
      is_leader_of_member: { Args: { p_ministry_member_id: string }; Returns: boolean }
      is_ministry_leader: { Args: { p_ministry_id: string }; Returns: boolean }
      is_ministry_member: { Args: { p_ministry_id: string }; Returns: boolean }
      is_self_member: { Args: { p_ministry_member_id: string }; Returns: boolean }
      is_setlist_leader: { Args: { p_setlist_id: string }; Returns: boolean }
      shares_church_with: { Args: { p_user_id: string }; Returns: boolean }
      slugify: { Args: { p_text: string }; Returns: string }
    }
    Enums: {
      assignment_status: 'scheduled' | 'confirmed' | 'declined'
      checkin_source: 'qr' | 'request' | 'manual'
      church_role: 'owner' | 'member'
      cycle_status: 'open' | 'closed'
      event_kind: 'service' | 'rehearsal' | 'other'
      justification_kind: 'late' | 'absence'
      justification_status: 'pending' | 'approved' | 'rejected'
      member_status: 'active' | 'inactive'
      ministry_member_role: 'leader' | 'member'
      point_reason: 'cycle_start' | 'late' | 'absence' | 'request_rejected' | 'adjustment'
      request_status: 'pending' | 'approved' | 'adjusted' | 'rejected'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      assignment_status: ['scheduled', 'confirmed', 'declined'],
      checkin_source: ['qr', 'request', 'manual'],
      church_role: ['owner', 'member'],
      cycle_status: ['open', 'closed'],
      event_kind: ['service', 'rehearsal', 'other'],
      justification_kind: ['late', 'absence'],
      justification_status: ['pending', 'approved', 'rejected'],
      member_status: ['active', 'inactive'],
      ministry_member_role: ['leader', 'member'],
      point_reason: ['cycle_start', 'late', 'absence', 'request_rejected', 'adjustment'],
      request_status: ['pending', 'approved', 'adjusted', 'rejected'],
    },
  },
} as const
