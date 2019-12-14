-- Table: public.batches

-- DROP TABLE public.batches;

CREATE TABLE  public.batches
(
    id integer NOT NULL DEFAULT nextval('batches_id_seq'::regclass),
    batch character(36) COLLATE pg_catalog."default" NOT NULL,
    created_on timestamp without time zone NOT NULL,
    CONSTRAINT batches_pkey PRIMARY KEY (id),
    CONSTRAINT batches_batch_key UNIQUE (batch)

)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.batches
    OWNER to slim_list_admin;

-- Index: batches_created_on_idx

-- DROP INDEX public.batches_created_on_idx;

CREATE INDEX batches_created_on_idx
    ON public.batches USING btree
    (created_on)
    TABLESPACE pg_default;

-- SEQUENCE: public.batches_id_seq

-- DROP SEQUENCE public.batches_id_seq;

CREATE SEQUENCE  public.batches_id_seq
    INCREMENT 1
    START 19
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.batches_id_seq
    OWNER TO slim_list_admin;

-- Table: public.batches_tags

-- DROP TABLE public.batches_tags;

CREATE TABLE  public.batches_tags
(
    id integer NOT NULL DEFAULT nextval('batches_tags_id_seq'::regclass),
    batch_id integer NOT NULL,
    tag_id integer NOT NULL,
    CONSTRAINT batches_tags_pkey PRIMARY KEY (id),
    CONSTRAINT batches_tags_batch_id_fkey FOREIGN KEY (batch_id)
        REFERENCES public.batches (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT batches_tags_tag_id_fkey FOREIGN KEY (tag_id)
        REFERENCES public.tags (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.batches_tags
    OWNER to slim_list_admin;

-- Index: batches_tags_batch_id_idx

-- DROP INDEX public.batches_tags_batch_id_idx;

CREATE INDEX batches_tags_batch_id_idx
    ON public.batches_tags USING btree
    (batch_id)
    TABLESPACE pg_default;

-- Index: batches_tags_tag_id_idx

-- DROP INDEX public.batches_tags_tag_id_idx;

CREATE INDEX batches_tags_tag_id_idx
    ON public.batches_tags USING btree
    (tag_id)
    TABLESPACE pg_default;

-- SEQUENCE: public.batches_tags_id_seq

-- DROP SEQUENCE public.batches_tags_id_seq;

CREATE SEQUENCE  public.batches_tags_id_seq
    INCREMENT 1
    START 1
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.batches_tags_id_seq
    OWNER TO slim_list_admin;

-- Table: public.dates

-- DROP TABLE public.dates;

CREATE TABLE  public.dates
(
    id integer NOT NULL DEFAULT nextval('dates_id_seq'::regclass),
    "timestamp" timestamp without time zone NOT NULL,
    CONSTRAINT dates_pkey PRIMARY KEY (id)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.dates
    OWNER to slim_list_admin;

-- SEQUENCE: public.dates_id_seq

-- DROP SEQUENCE public.dates_id_seq;

CREATE SEQUENCE  public.dates_id_seq
    INCREMENT 1
    START 38
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.dates_id_seq
    OWNER TO slim_list_admin;

-- Table: public.dates_filter_lists

-- DROP TABLE public.dates_filter_lists;

CREATE TABLE  public.dates_filter_lists
(
    id integer NOT NULL DEFAULT nextval('filter_lists_dates_id_seq'::regclass),
    filter_list_id integer NOT NULL,
    date_id integer NOT NULL,
    CONSTRAINT filter_lists_dates_pkey PRIMARY KEY (id),
    CONSTRAINT filter_lists_dates_date_id_fkey FOREIGN KEY (date_id)
        REFERENCES public.dates (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT filter_lists_dates_filter_list_id_fkey FOREIGN KEY (filter_list_id)
        REFERENCES public.filter_lists (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.dates_filter_lists
    OWNER to slim_list_admin;

-- Index: dates_filter_lists_date_id_idx

-- DROP INDEX public.dates_filter_lists_date_id_idx;

CREATE INDEX dates_filter_lists_date_id_idx
    ON public.dates_filter_lists USING btree
    (date_id)
    TABLESPACE pg_default;

-- Index: dates_filter_lists_filter_list_id_idx

-- DROP INDEX public.dates_filter_lists_filter_list_id_idx;

CREATE INDEX dates_filter_lists_filter_list_id_idx
    ON public.dates_filter_lists USING btree
    (filter_list_id)
    TABLESPACE pg_default;

-- Table: public.domains

-- DROP TABLE public.domains;

CREATE TABLE  public.domains
(
    id integer NOT NULL DEFAULT nextval('domains_id_seq'::regclass),
    domain character varying(1024) COLLATE pg_catalog."default" NOT NULL,
    sha256 character(64) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT domains_pkey PRIMARY KEY (id),
    CONSTRAINT domains_sha256_key UNIQUE (sha256)

)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.domains
    OWNER to slim_list_admin;

-- SEQUENCE: public.domains_id_seq

-- DROP SEQUENCE public.domains_id_seq;

CREATE SEQUENCE  public.domains_id_seq
    INCREMENT 1
    START 52636
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.domains_id_seq
    OWNER TO slim_list_admin;

-- Table: public.filter_lists

-- DROP TABLE public.filter_lists;

CREATE TABLE  public.filter_lists
(
    id integer NOT NULL DEFAULT nextval('filter_lists_id_seq'::regclass),
    url_id integer NOT NULL,
    sha256 character(64) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT filter_lists_pkey PRIMARY KEY (id),
    CONSTRAINT filter_lists_sha256_key UNIQUE (sha256)
,
    CONSTRAINT filter_lists_url_id_fkey FOREIGN KEY (url_id)
        REFERENCES public.urls (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.filter_lists
    OWNER to slim_list_admin;

-- Index: filter_lists_url_id_idx

-- DROP INDEX public.filter_lists_url_id_idx;

CREATE INDEX filter_lists_url_id_idx
    ON public.filter_lists USING btree
    (url_id)
    TABLESPACE pg_default;

-- SEQUENCE: public.filter_lists_id_seq

-- DROP SEQUENCE public.filter_lists_id_seq;

CREATE SEQUENCE  public.filter_lists_id_seq
    INCREMENT 1
    START 12
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.filter_lists_id_seq
    OWNER TO slim_list_admin;

-- SEQUENCE: public.filter_lists_dates_id_seq

-- DROP SEQUENCE public.filter_lists_dates_id_seq;

CREATE SEQUENCE  public.filter_lists_dates_id_seq
    INCREMENT 1
    START 38
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.filter_lists_dates_id_seq
    OWNER TO slim_list_admin;

-- Table: public.filter_lists_rules

-- DROP TABLE public.filter_lists_rules;

CREATE TABLE  public.filter_lists_rules
(
    id integer NOT NULL DEFAULT nextval('filter_lists_rules_id_seq'::regclass),
    filter_list_id integer NOT NULL,
    rule_id integer NOT NULL,
    CONSTRAINT filter_lists_rules_pkey PRIMARY KEY (id),
    CONSTRAINT filter_lists_rules_filter_list_id_fkey FOREIGN KEY (filter_list_id)
        REFERENCES public.filter_lists (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT filter_lists_rules_rule_id_fkey FOREIGN KEY (rule_id)
        REFERENCES public.rules (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.filter_lists_rules
    OWNER to slim_list_admin;

-- SEQUENCE: public.filter_lists_rules_id_seq

-- DROP SEQUENCE public.filter_lists_rules_id_seq;

CREATE SEQUENCE  public.filter_lists_rules_id_seq
    INCREMENT 1
    START 549894
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.filter_lists_rules_id_seq
    OWNER TO slim_list_admin;

-- Table: public.frames

-- DROP TABLE public.frames;

CREATE TABLE  public.frames
(
    id integer NOT NULL DEFAULT nextval('frames_id_seq'::regclass),
    page_id integer NOT NULL,
    url_id integer NOT NULL,
    chrome_parent_frame_id character(32) COLLATE pg_catalog."default",
    chrome_frame_id character(32) COLLATE pg_catalog."default",
    CONSTRAINT frames_pkey PRIMARY KEY (id),
    CONSTRAINT frames_page_id_fkey FOREIGN KEY (page_id)
        REFERENCES public.pages (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT frames_url_id_fkey FOREIGN KEY (url_id)
        REFERENCES public.urls (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.frames
    OWNER to slim_list_admin;

-- SEQUENCE: public.frames_id_seq

-- DROP SEQUENCE public.frames_id_seq;

CREATE SEQUENCE  public.frames_id_seq
    INCREMENT 1
    START 7892271
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.frames_id_seq
    OWNER TO slim_list_admin;

-- Table: public.pages

-- DROP TABLE public.pages;

CREATE TABLE  public.pages
(
    id integer NOT NULL DEFAULT nextval('pages_id_seq'::regclass),
    batch_id integer NOT NULL,
    domain_id integer NOT NULL,
    url_id integer NOT NULL,
    crawled_on timestamp without time zone NOT NULL,
    depth integer NOT NULL,
    breath integer NOT NULL,
    CONSTRAINT pages_pkey PRIMARY KEY (id),
    CONSTRAINT pages_batch_id_fkey FOREIGN KEY (batch_id)
        REFERENCES public.batches (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT pages_domain_id_fkey FOREIGN KEY (domain_id)
        REFERENCES public.domains (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT pages_url_id_fkey FOREIGN KEY (url_id)
        REFERENCES public.urls (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.pages
    OWNER to slim_list_admin;

-- SEQUENCE: public.pages_id_seq

-- DROP SEQUENCE public.pages_id_seq;

CREATE SEQUENCE  public.pages_id_seq
    INCREMENT 1
    START 54438
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.pages_id_seq
    OWNER TO slim_list_admin;

-- Index: pages_batch_id_idx

-- DROP INDEX public.pages_batch_id_idx;

CREATE INDEX pages_batch_id_idx
    ON public.pages USING btree
    (batch_id)
    TABLESPACE pg_default;

-- Index: pages_domain_id_idx

-- DROP INDEX public.pages_domain_id_idx;

CREATE INDEX pages_domain_id_idx
    ON public.pages USING btree
    (domain_id)
    TABLESPACE pg_default;

-- Index: pages_url_id_idx

-- DROP INDEX public.pages_url_id_idx;

CREATE INDEX pages_url_id_idx
    ON public.pages USING btree
    (url_id)
    TABLESPACE pg_default;

-- Table: public.request_types

-- DROP TABLE public.request_types;

CREATE TABLE  public.request_types
(
    id integer NOT NULL DEFAULT nextval('request_types_id_seq'::regclass),
    name character varying(50) COLLATE pg_catalog."default" NOT NULL,
    sha256 character(64) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT request_types_pkey PRIMARY KEY (id),
    CONSTRAINT request_types_sha256_key UNIQUE (sha256)

)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.request_types
    OWNER to slim_list_admin;

-- SEQUENCE: public.request_types_id_seq

-- DROP SEQUENCE public.request_types_id_seq;

CREATE SEQUENCE  public.request_types_id_seq
    INCREMENT 1
    START 7670
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.request_types_id_seq
    OWNER TO slim_list_admin;

-- Table: public.requests

-- DROP TABLE public.requests;

CREATE TABLE  public.requests
(
    id integer NOT NULL DEFAULT nextval('requests_id_seq'::regclass),
    url_id integer NOT NULL,
    frame_id integer NOT NULL,
    request_type_id integer NOT NULL,
    rule_id integer,
    excepting_rule_id integer,
    is_blocked boolean NOT NULL,
    response_sha256 character(64) COLLATE pg_catalog."default",
    requested_at timestamp without time zone NOT NULL,
    CONSTRAINT requests_pkey PRIMARY KEY (id),
    CONSTRAINT requests_excepting_rule_id_fkey FOREIGN KEY (excepting_rule_id)
        REFERENCES public.rules (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT requests_frame_id_fkey FOREIGN KEY (frame_id)
        REFERENCES public.frames (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT requests_request_type_id_fkey FOREIGN KEY (request_type_id)
        REFERENCES public.request_types (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT requests_rule_id_fkey FOREIGN KEY (rule_id)
        REFERENCES public.rules (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT requests_url_id_fkey FOREIGN KEY (url_id)
        REFERENCES public.urls (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.requests
    OWNER to slim_list_admin;

-- Index: requests_ request_type_id_idx

-- DROP INDEX public."requests_ request_type_id_idx";

CREATE INDEX "requests_ request_type_id_idx"
    ON public.requests USING btree
    (request_type_id)
    TABLESPACE pg_default;

-- SEQUENCE: public.requests_id_seq

-- DROP SEQUENCE public.requests_id_seq;

CREATE SEQUENCE  public.requests_id_seq
    INCREMENT 1
    START 7892271
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.requests_id_seq
    OWNER TO slim_list_admin;

-- Index: requests_excepting_rule_id_idx

-- DROP INDEX public.requests_excepting_rule_id_idx;

CREATE INDEX requests_excepting_rule_id_idx
    ON public.requests USING btree
    (excepting_rule_id)
    TABLESPACE pg_default;

-- Index: requests_frame_id_idx

-- DROP INDEX public.requests_frame_id_idx;

CREATE INDEX requests_frame_id_idx
    ON public.requests USING btree
    (frame_id)
    TABLESPACE pg_default;

-- Index: requests_is_blocked_idx

-- DROP INDEX public.requests_is_blocked_idx;

CREATE INDEX requests_is_blocked_idx
    ON public.requests USING btree
    (is_blocked)
    TABLESPACE pg_default;

-- Index: requests_rule_id_idx

-- DROP INDEX public.requests_rule_id_idx;

CREATE INDEX requests_rule_id_idx
    ON public.requests USING btree
    (rule_id)
    TABLESPACE pg_default;

-- Index: requests_url_id_idx

-- DROP INDEX public.requests_url_id_idx;

CREATE INDEX requests_url_id_idx
    ON public.requests USING btree
    (url_id)
    TABLESPACE pg_default;

-- Table: public.rules

-- DROP TABLE public.rules;

CREATE TABLE  public.rules
(
    id integer NOT NULL DEFAULT nextval('rulex_id_seq'::regclass),
    rule text COLLATE pg_catalog."default" NOT NULL,
    sha256 character(64) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT rules_pkey PRIMARY KEY (id),
    CONSTRAINT rules_sha256_key UNIQUE (sha256)

)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.rules
    OWNER to slim_list_admin;

-- SEQUENCE: public.rulex_id_seq

-- DROP SEQUENCE public.rulex_id_seq;

CREATE SEQUENCE  public.rulex_id_seq
    INCREMENT 1
    START 744668
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.rulex_id_seq
    OWNER TO slim_list_admin;

-- Table: public.tags

-- DROP TABLE public.tags;

CREATE TABLE  public.tags
(
    id integer NOT NULL DEFAULT nextval('tags_id_seq'::regclass),
    name character varying(128) COLLATE pg_catalog."default" NOT NULL,
    sha256 character(64) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT tags_pkey PRIMARY KEY (id),
    CONSTRAINT tags_sha256_key UNIQUE (sha256)

)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.tags
    OWNER to slim_list_admin;

-- SEQUENCE: public.tags_id_seq

-- DROP SEQUENCE public.tags_id_seq;

CREATE SEQUENCE  public.tags_id_seq
    INCREMENT 1
    START 1
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.tags_id_seq
    OWNER TO slim_list_admin;

-- Table: public.urls

-- DROP TABLE public.urls;

CREATE TABLE  public.urls
(
    id integer NOT NULL DEFAULT nextval('urls_id_seq'::regclass),
    url text COLLATE pg_catalog."default" NOT NULL,
    sha256 character(64) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT urls_pkey PRIMARY KEY (id),
    CONSTRAINT urls_sha256_key UNIQUE (sha256)

)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.urls
    OWNER to slim_list_admin;

-- SEQUENCE: public.urls_id_seq

-- DROP SEQUENCE public.urls_id_seq;

CREATE SEQUENCE  public.urls_id_seq
    INCREMENT 1
    START 6168386
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

ALTER SEQUENCE public.urls_id_seq
    OWNER TO slim_list_admin;
