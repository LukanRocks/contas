CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"currency_code" text NOT NULL,
	"system_key" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_id_space_id_key" UNIQUE("id","space_id"),
	CONSTRAINT "accounts_name_check" CHECK (char_length("accounts"."name") BETWEEN 1 AND 100),
	CONSTRAINT "accounts_kind_check" CHECK ("accounts"."kind" IN ('managed', 'unmanaged', 'system')),
	CONSTRAINT "accounts_system_key_check" CHECK (("accounts"."kind" = 'system') = ("accounts"."system_key" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"actor_id" uuid,
	"actor_name" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_entity_type_check" CHECK ("audit_log"."entity_type" IN ('user', 'space', 'space_member', 'account', 'transaction')),
	CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" IN ('create', 'update', 'delete'))
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"minor_units" smallint NOT NULL,
	CONSTRAINT "currencies_minor_units_check" CHECK ("currencies"."minor_units" BETWEEN 0 AND 18)
);
--> statement-breakpoint
CREATE TABLE "space_members" (
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_members_space_id_user_id_pk" PRIMARY KEY("space_id","user_id"),
	CONSTRAINT "space_members_role_check" CHECK ("space_members"."role" IN ('owner', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_name_check" CHECK (char_length("spaces"."name") BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"from_account_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"from_value" bigint NOT NULL,
	"to_value" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_name_check" CHECK (char_length("transactions"."name") BETWEEN 1 AND 200),
	CONSTRAINT "transactions_from_value_check" CHECK ("transactions"."from_value" > 0),
	CONSTRAINT "transactions_to_value_check" CHECK ("transactions"."to_value" > 0),
	CONSTRAINT "transactions_accounts_differ_check" CHECK ("transactions"."from_account_id" <> "transactions"."to_account_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_name_check" CHECK (char_length("users"."name") BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_account_fk" FOREIGN KEY ("from_account_id","space_id") REFERENCES "public"."accounts"("id","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_fk" FOREIGN KEY ("to_account_id","space_id") REFERENCES "public"."accounts"("id","space_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_space_name_uq" ON "accounts" USING btree ("space_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_space_system_uq" ON "accounts" USING btree ("space_id","system_key","currency_code") WHERE "accounts"."system_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_space_idx" ON "audit_log" USING btree ("space_id","at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "transactions_from_idx" ON "transactions" USING btree ("from_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "transactions_to_idx" ON "transactions" USING btree ("to_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "transactions_space_idx" ON "transactions" USING btree ("space_id","occurred_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);