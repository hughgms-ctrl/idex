export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      announcements: {
        Row: {
          audience: string
          body: string
          channel: string
          church_id: string
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          member_ids: string[]
          ministry_id: string
          recipients_count: number | null
          send_at: string
          sent_at: string | null
          status: string
          title: string
        }
        ComputedFields: never
        Insert: {
          audience?: string
          body: string
          channel?: string
          church_id: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          member_ids?: string[]
          ministry_id: string
          recipients_count?: number | null
          send_at?: string
          sent_at?: string | null
          status?: string
          title: string
        }
        Update: {
          audience?: string
          body?: string
          channel?: string
          church_id?: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          member_ids?: string[]
          ministry_id?: string
          recipients_count?: number | null
          send_at?: string
          sent_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'announcements_event_id_church_id_fkey'
            columns: ['event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'announcements_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
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
      chat_conversations: {
        Row: {
          church_id: string
          created_at: string
          direct_key: string | null
          event_id: string | null
          id: string
          kind: string
          last_message_at: string | null
          ministry_id: string | null
        }
        ComputedFields: never
        Insert: {
          church_id: string
          created_at?: string
          direct_key?: string | null
          event_id?: string | null
          id?: string
          kind: string
          last_message_at?: string | null
          ministry_id?: string | null
        }
        Update: {
          church_id?: string
          created_at?: string
          direct_key?: string | null
          event_id?: string | null
          id?: string
          kind?: string
          last_message_at?: string | null
          ministry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'chat_conversations_church_id_fkey'
            columns: ['church_id']
            isOneToOne: false
            referencedRelation: 'churches'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chat_conversations_event_id_church_id_fkey'
            columns: ['event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'chat_conversations_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          church_id: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          sender_id: string | null
        }
        ComputedFields: never
        Insert: {
          body: string
          church_id: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          church_id?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'chat_messages_conversation_id_church_id_fkey'
            columns: ['conversation_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'chat_conversations'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'chat_messages_sender_id_fkey'
            columns: ['sender_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      chat_participants: {
        Row: {
          church_id: string
          conversation_id: string
          created_at: string
          profile_id: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          conversation_id: string
          created_at?: string
          profile_id: string
        }
        Update: {
          church_id?: string
          conversation_id?: string
          created_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chat_participants_conversation_id_church_id_fkey'
            columns: ['conversation_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'chat_conversations'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'chat_participants_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      chat_reads: {
        Row: {
          church_id: string
          conversation_id: string
          last_notified_at: string | null
          last_read_at: string | null
          muted: boolean
          profile_id: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          conversation_id: string
          last_notified_at?: string | null
          last_read_at?: string | null
          muted?: boolean
          profile_id: string
        }
        Update: {
          church_id?: string
          conversation_id?: string
          last_notified_at?: string | null
          last_read_at?: string | null
          muted?: boolean
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chat_reads_conversation_id_church_id_fkey'
            columns: ['conversation_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'chat_conversations'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'chat_reads_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      checkin_attempts: {
        Row: {
          accuracy_m: number | null
          attempted_at: string
          church_id: string
          distance_m: number | null
          event_id: string
          id: string
          lat: number | null
          lng: number | null
          ministry_member_id: string
          outcome: string
        }
        ComputedFields: never
        Insert: {
          accuracy_m?: number | null
          attempted_at?: string
          church_id: string
          distance_m?: number | null
          event_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          ministry_member_id: string
          outcome: string
        }
        Update: {
          accuracy_m?: number | null
          attempted_at?: string
          church_id?: string
          distance_m?: number | null
          event_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          ministry_member_id?: string
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: 'checkin_attempts_event_id_church_id_fkey'
            columns: ['event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'checkin_attempts_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
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
      event_availability: {
        Row: {
          available: boolean
          church_id: string
          event_id: string
          ministry_member_id: string
          note: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          available: boolean
          church_id: string
          event_id: string
          ministry_member_id: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          available?: boolean
          church_id?: string
          event_id?: string
          ministry_member_id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'event_availability_event_id_church_id_fkey'
            columns: ['event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'event_availability_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      events: {
        Row: {
          arrive_at: string | null
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
          service_event_id: string | null
          soundcheck_at: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          arrive_at?: string | null
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
          service_event_id?: string | null
          soundcheck_at?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          arrive_at?: string | null
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
          service_event_id?: string | null
          soundcheck_at?: string | null
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
          {
            foreignKeyName: 'events_service_link_fk'
            columns: ['service_event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
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
          can_edit_setlists: boolean
          can_edit_songs: boolean
          can_manage_song_files: boolean
          can_send_announcements: boolean
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
          can_edit_setlists?: boolean
          can_edit_songs?: boolean
          can_manage_song_files?: boolean
          can_send_announcements?: boolean
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
          can_edit_setlists?: boolean
          can_edit_songs?: boolean
          can_manage_song_files?: boolean
          can_send_announcements?: boolean
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
          availability_deadline: string | null
          availability_ends_on: string | null
          availability_starts_on: string | null
          checkin_code: string
          checkin_mode: string
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
          rehearsal_arrival_minutes: number
          rehearsal_days_before: number
          rehearsal_duration_min: number
          rehearsal_enabled: boolean
          rehearsal_excused_policy: string
          rehearsal_forgot_policy: string
          rehearsal_late_consequence: string
          rehearsal_mode: string
          rehearsal_time: string
          rehearsal_tolerance_min: number
          recovery_enabled: boolean
          recovery_every: number
          recovery_points: number
          rehearsal_weekday: number | null
          service_arrival_minutes: number
          service_late_consequence: string
          service_soundcheck_minutes: number | null
          service_tolerance_min: number
          team_agreements: string
          team_ontime_goal: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          absence_penalty?: number
          availability_deadline?: string | null
          availability_ends_on?: string | null
          availability_starts_on?: string | null
          checkin_code?: string
          checkin_mode?: string
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
          rehearsal_arrival_minutes?: number
          rehearsal_days_before?: number
          rehearsal_duration_min?: number
          rehearsal_enabled?: boolean
          rehearsal_excused_policy?: string
          rehearsal_forgot_policy?: string
          rehearsal_late_consequence?: string
          rehearsal_mode?: string
          rehearsal_time?: string
          rehearsal_tolerance_min?: number
          recovery_enabled?: boolean
          recovery_every?: number
          recovery_points?: number
          rehearsal_weekday?: number | null
          service_arrival_minutes?: number
          service_late_consequence?: string
          service_soundcheck_minutes?: number | null
          service_tolerance_min?: number
          team_agreements?: string
          team_ontime_goal?: number
          updated_at?: string
        }
        Update: {
          absence_penalty?: number
          availability_deadline?: string | null
          availability_ends_on?: string | null
          availability_starts_on?: string | null
          checkin_code?: string
          checkin_mode?: string
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
          rehearsal_arrival_minutes?: number
          rehearsal_days_before?: number
          rehearsal_duration_min?: number
          rehearsal_enabled?: boolean
          rehearsal_excused_policy?: string
          rehearsal_forgot_policy?: string
          rehearsal_late_consequence?: string
          rehearsal_mode?: string
          rehearsal_time?: string
          rehearsal_tolerance_min?: number
          recovery_enabled?: boolean
          recovery_every?: number
          recovery_points?: number
          rehearsal_weekday?: number | null
          service_arrival_minutes?: number
          service_late_consequence?: string
          service_soundcheck_minutes?: number | null
          service_tolerance_min?: number
          team_agreements?: string
          team_ontime_goal?: number
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
      notification_queue: {
        Row: {
          attempts: number
          church_id: string
          created_at: string
          dedupe_key: string
          id: string
          kind: Database['public']['Enums']['notification_kind']
          last_error: string | null
          next_attempt_at: string
          payload: NonNullable<Json>
          profile_id: string
          push_sent_at: string | null
          sent_at: string | null
          status: Database['public']['Enums']['notification_status']
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          church_id: string
          created_at?: string
          dedupe_key: string
          id?: string
          kind: Database['public']['Enums']['notification_kind']
          last_error?: string | null
          next_attempt_at?: string
          payload?: NonNullable<Json>
          profile_id: string
          push_sent_at?: string | null
          sent_at?: string | null
          status?: Database['public']['Enums']['notification_status']
        }
        Update: {
          attempts?: number
          church_id?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: Database['public']['Enums']['notification_kind']
          last_error?: string | null
          next_attempt_at?: string
          payload?: NonNullable<Json>
          profile_id?: string
          push_sent_at?: string | null
          sent_at?: string | null
          status?: Database['public']['Enums']['notification_status']
        }
        Relationships: [
          {
            foreignKeyName: 'notification_queue_church_id_fkey'
            columns: ['church_id']
            isOneToOne: false
            referencedRelation: 'churches'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notification_queue_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
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
          app_installed_at: string | null
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          whatsapp_opt_out: boolean
        }
        ComputedFields: never
        Insert: {
          app_installed_at?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
          whatsapp_opt_out?: boolean
        }
        Update: {
          app_installed_at?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          whatsapp_opt_out?: boolean
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_success_at: string | null
          p256dh: string
          profile_id: string
          user_agent: string | null
        }
        ComputedFields: never
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_success_at?: string | null
          p256dh: string
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_success_at?: string | null
          p256dh?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
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
      rehearsal_availability: {
        Row: {
          church_id: string
          event_id: string
          ministry_member_id: string
          note: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          church_id: string
          event_id: string
          ministry_member_id: string
          note?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          event_id?: string
          ministry_member_id?: string
          note?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'rehearsal_availability_event_id_church_id_fkey'
            columns: ['event_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id', 'church_id']
          },
          {
            foreignKeyName: 'rehearsal_availability_ministry_member_id_church_id_fkey'
            columns: ['ministry_member_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministry_members'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      reminder_rules: {
        Row: {
          at_time: string | null
          church_id: string
          created_at: string
          days_before: number | null
          enabled: boolean
          event_kind: Database['public']['Enums']['event_kind']
          id: string
          ministry_id: string
          minutes_before: number | null
          push_only: boolean
          timing: string
          weekday: number | null
        }
        ComputedFields: never
        Insert: {
          at_time?: string | null
          church_id: string
          created_at?: string
          days_before?: number | null
          enabled?: boolean
          event_kind: Database['public']['Enums']['event_kind']
          id?: string
          ministry_id: string
          minutes_before?: number | null
          push_only?: boolean
          timing: string
          weekday?: number | null
        }
        Update: {
          at_time?: string | null
          church_id?: string
          created_at?: string
          days_before?: number | null
          enabled?: boolean
          event_kind?: Database['public']['Enums']['event_kind']
          id?: string
          ministry_id?: string
          minutes_before?: number | null
          push_only?: boolean
          timing?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'reminder_rules_ministry_id_church_id_fkey'
            columns: ['ministry_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'ministries'
            referencedColumns: ['id', 'church_id']
          },
        ]
      }
      schedule_assignments: {
        Row: {
          benched_reason: string | null
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
          benched_reason?: string | null
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
          benched_reason?: string | null
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
      song_files: {
        Row: {
          bpm: number | null
          church_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          mime_type: string | null
          musical_key: string | null
          name: string
          size_bytes: number | null
          song_id: string
          storage_backend: string
          storage_path: string
        }
        ComputedFields: never
        Insert: {
          bpm?: number | null
          church_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          mime_type?: string | null
          musical_key?: string | null
          name: string
          size_bytes?: number | null
          song_id: string
          storage_backend?: string
          storage_path: string
        }
        Update: {
          bpm?: number | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          musical_key?: string | null
          name?: string
          size_bytes?: number | null
          song_id?: string
          storage_backend?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: 'song_files_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'song_files_song_id_church_id_fkey'
            columns: ['song_id', 'church_id']
            isOneToOne: false
            referencedRelation: 'songs'
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
          is_new: boolean
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
          is_new?: boolean
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
          is_new?: boolean
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
      apply_checkin_request_review: {
        Args: {
          p_arrived_at: string
          p_delta: number
          p_late_minutes: number
          p_note?: string
          p_request_id: string
          p_reviewer: string
          p_status: Database['public']['Enums']['request_status']
        }
        Returns: undefined
      }
      apply_late_consequence: {
        Args: {
          p_event_id: string
          p_ministry_member_id: string
          p_reason?: string
          p_scope: string
        }
        Returns: number
      }
      can_edit_setlist: { Args: { p_setlist_id: string }; Returns: boolean }
      can_edit_setlist_of_event: { Args: { p_event_id: string }; Returns: boolean }
      can_justify_event: {
        Args: { p_event_id: string; p_ministry_member_id: string }
        Returns: boolean
      }
      can_manage_song: { Args: { p_song_id: string }; Returns: boolean }
      claim_notifications: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          id: string
          kind: Database['public']['Enums']['notification_kind']
          payload: Json
          phone: string
          profile_id: string
          push_sent: boolean
        }[]
      }
      close_due_cycles: { Args: Record<PropertyKey, never>; Returns: number }
      confirm_my_presence: { Args: { p_event_id: string }; Returns: number }
      create_checkin_request: {
        Args: {
          p_declared_arrived_at: string
          p_device_location?: Json
          p_event_id: string
          p_reason: string
        }
        Returns: string
      }
      create_church: {
        Args: { p_church_name: string; p_full_name?: string; p_ministry_name?: string }
        Returns: string
      }
      cycle_for_event: { Args: { p_event_id: string }; Returns: string }
      announcement_audience_people: {
        Args: {
          p_audience: string
          p_event_id?: string
          p_member_ids?: string[]
          p_ministry_id: string
        }
        Returns: {
          full_name: string
          has_push: boolean
          has_whatsapp: boolean
          profile_id: string
        }[]
      }
      announcement_deliveries: {
        Args: { p_announcement_id: string }
        Returns: {
          full_name: string
          has_whatsapp: boolean
          last_error: string | null
          profile_id: string
          push_sent_at: string | null
          sent_at: string | null
          status: Database['public']['Enums']['notification_status']
        }[]
      }
      count_announcement_audience: {
        Args: {
          p_audience: string
          p_event_id?: string
          p_member_ids?: string[]
          p_ministry_id: string
        }
        Returns: number
      }
      delete_push_subscription: { Args: { p_endpoint: string }; Returns: undefined }
      dispatch_announcements: { Args: Record<PropertyKey, never>; Returns: number }
      dispatch_notifications_http: { Args: Record<PropertyKey, never>; Returns: undefined }
      enqueue_notification: {
        Args: {
          p_church_id: string
          p_dedupe_key: string
          p_kind: Database['public']['Enums']['notification_kind']
          p_payload: Json
          p_profile_id: string
        }
        Returns: undefined
      }
      enqueue_reminders: { Args: Record<PropertyKey, never>; Returns: number }
      event_end: { Args: { p_ends_at: string; p_starts_at: string }; Returns: string }
      finish_notification: {
        Args: { p_error?: string; p_id: string; p_ok: boolean; p_retry_at?: string }
        Returns: undefined
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
      has_ministry_permission: {
        Args: { p_ministry_id: string; p_permission: string }
        Returns: boolean
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
      log_checkin_attempt: {
        Args: {
          p_accuracy_m?: number
          p_distance_m?: number
          p_event_id: string
          p_lat?: number
          p_lng?: number
          p_ministry_member_id: string
          p_outcome: string
        }
        Returns: undefined
      }
      process_absences: { Args: Record<PropertyKey, never>; Returns: number }
      record_attendance: {
        Args: {
          p_accuracy_m?: number
          p_actor?: string
          p_arrived_at: string
          p_delta: number
          p_distance_m?: number
          p_event_id: string
          p_lat?: number
          p_late_minutes: number
          p_lng?: number
          p_ministry_member_id: string
          p_request_id?: string
          p_source: Database['public']['Enums']['checkin_source']
        }
        Returns: string
      }
      regenerate_checkin_code: { Args: { p_ministry_id: string }; Returns: string }
      reminder_fire_at: {
        Args: {
          p_arrive_at: string
          p_at_time: string
          p_days_before: number
          p_minutes_before: number
          p_starts_at: string
          p_timing: string
          p_tz: string
          p_weekday: number
        }
        Returns: string
      }
      requeue_stuck_notifications: { Args: Record<PropertyKey, never>; Returns: number }
      review_justification: {
        Args: { p_approve: boolean; p_justification_id: string; p_note?: string }
        Returns: undefined
      }
      set_current_cycle: {
        Args: {
          p_ends_on: string
          p_ministry_id: string
          p_next_months: number
          p_starts_on: string
        }
        Returns: Database['public']['Tables']['cycles']['Row']
      }
      can_access_chat_topic: { Args: { p_topic: string }; Returns: boolean }
      can_access_conversation: { Args: { p_conversation_id: string }; Returns: boolean }
      can_send_to_conversation: { Args: { p_conversation_id: string }; Returns: boolean }
      delete_chat_message: { Args: { p_message_id: string }; Returns: undefined }
      mark_conversation_read: { Args: { p_conversation_id: string }; Returns: undefined }
      my_conversations: {
        Args: { p_church_id: string }
        Returns: {
          archived: boolean
          event_id: string | null
          event_starts_at: string | null
          id: string
          kind: string
          last_body: string | null
          last_deleted: boolean
          last_message_at: string | null
          last_sender_id: string | null
          last_sender_name: string
          ministry_id: string | null
          muted: boolean
          other_profile_id: string | null
          title: string
          unread: number
        }[]
      }
      open_direct_conversation: {
        Args: { p_church_id: string; p_profile_id: string }
        Returns: string
      }
      set_conversation_muted: {
        Args: { p_conversation_id: string; p_muted: boolean }
        Returns: undefined
      }
      mark_app_installed: { Args: Record<PropertyKey, never>; Returns: undefined }
      ministry_month_stats: { Args: { p_ministry_id: string }; Returns: Json }
      ministry_member_devices: {
        Args: { p_ministry_id: string }
        Returns: { app_installed: boolean; ministry_member_id: string; push_enabled: boolean }[]
      }
      send_test_push: { Args: Record<PropertyKey, never>; Returns: boolean }
      save_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string; p_user_agent?: string }
        Returns: undefined
      }
      seed_reminder_rules: {
        Args: { p_church_id: string; p_ministry_id: string }
        Returns: undefined
      }
      shares_church_with: { Args: { p_user_id: string }; Returns: boolean }
      slugify: { Args: { p_text: string }; Returns: string }
      storage_church_id: { Args: { p_name: string }; Returns: string }
      storage_song_id: { Args: { p_name: string }; Returns: string }
    }
    Enums: {
      assignment_status: 'scheduled' | 'confirmed' | 'declined' | 'benched'
      checkin_source: 'qr' | 'geo' | 'request' | 'manual'
      church_role: 'owner' | 'member'
      cycle_status: 'open' | 'closing' | 'closed'
      event_kind: 'service' | 'rehearsal' | 'other'
      justification_kind: 'late' | 'absence'
      justification_status: 'pending' | 'approved' | 'rejected'
      member_status: 'active' | 'inactive'
      ministry_member_role: 'leader' | 'member'
      notification_kind:
        | 'schedule_reminder'
        | 'rehearsal_today'
        | 'points_deducted'
        | 'request_reviewed'
        | 'member_benched'
        | 'event_rescheduled'
        | 'event_reminder'
        | 'announcement'
      notification_status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'
      point_reason:
        'cycle_start' | 'late' | 'absence' | 'request_rejected' | 'adjustment' | 'recovery'
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
      assignment_status: ['scheduled', 'confirmed', 'declined', 'benched'],
      checkin_source: ['qr', 'geo', 'request', 'manual'],
      church_role: ['owner', 'member'],
      cycle_status: ['open', 'closing', 'closed'],
      event_kind: ['service', 'rehearsal', 'other'],
      justification_kind: ['late', 'absence'],
      justification_status: ['pending', 'approved', 'rejected'],
      member_status: ['active', 'inactive'],
      ministry_member_role: ['leader', 'member'],
      notification_kind: [
        'schedule_reminder',
        'rehearsal_today',
        'points_deducted',
        'request_reviewed',
        'member_benched',
        'event_rescheduled',
        'event_reminder',
        'announcement',
      ],
      notification_status: ['pending', 'sending', 'sent', 'failed', 'skipped'],
      point_reason: [
        'cycle_start',
        'late',
        'absence',
        'request_rejected',
        'adjustment',
        'recovery',
      ],
      request_status: ['pending', 'approved', 'adjusted', 'rejected'],
    },
  },
} as const
