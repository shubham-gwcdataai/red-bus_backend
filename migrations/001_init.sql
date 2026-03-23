CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS payment_orders  CASCADE;
DROP TABLE IF EXISTS booking_seats   CASCADE;
DROP TABLE IF EXISTS bookings        CASCADE;
DROP TABLE IF EXISTS seats           CASCADE;
DROP TABLE IF EXISTS dropping_points CASCADE;
DROP TABLE IF EXISTS boarding_points CASCADE;
DROP TABLE IF EXISTS trips           CASCADE;
DROP TABLE IF EXISTS buses           CASCADE;
DROP TABLE IF EXISTS users           CASCADE;

-- USERS
CREATE TABLE users (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(100)         NOT NULL,
  email        VARCHAR(150) UNIQUE   NOT NULL,
  phone        VARCHAR(15),
  password     TEXT                 NOT NULL,
  role         VARCHAR(10)          NOT NULL DEFAULT 'user'
                 CHECK (role IN ('user','admin')),
  created_at   TIMESTAMP            NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP            NOT NULL DEFAULT NOW()
);

-- BUSES
CREATE TABLE buses (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(100) NOT NULL,
  operator_name       VARCHAR(150) NOT NULL,
  bus_type            VARCHAR(50)  NOT NULL
                        CHECK (bus_type IN (
                          'AC Sleeper','Non-AC Sleeper',
                          'AC Seater','Non-AC Seater','AC Semi-Sleeper'
                        )),
  total_seats         INT          NOT NULL DEFAULT 40,
  amenities           TEXT[]       NOT NULL DEFAULT '{}',
  cancellation_policy TEXT,
  refund_policy       TEXT,
  created_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- TRIPS
CREATE TABLE trips (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  bus_id          UUID          REFERENCES buses(id) ON DELETE CASCADE,
  source          VARCHAR(100)  NOT NULL,
  destination     VARCHAR(100)  NOT NULL,
  departure_time  TIME          NOT NULL,
  arrival_time    TIME          NOT NULL,
  duration        VARCHAR(20)   NOT NULL,
  price           NUMERIC(10,2) NOT NULL,
  original_price  NUMERIC(10,2),
  travel_date     DATE          NOT NULL,
  available_seats INT           NOT NULL,
  rating          NUMERIC(3,1)  NOT NULL DEFAULT 4.0,
  review_count    INT           NOT NULL DEFAULT 0,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- BOARDING POINTS
CREATE TABLE boarding_points (
  id        UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id   UUID         REFERENCES trips(id) ON DELETE CASCADE,
  name      VARCHAR(150) NOT NULL,
  time      TIME         NOT NULL,
  address   TEXT         NOT NULL
);

-- DROPPING POINTS
CREATE TABLE dropping_points (
  id        UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id   UUID         REFERENCES trips(id) ON DELETE CASCADE,
  name      VARCHAR(150) NOT NULL,
  time      TIME         NOT NULL,
  address   TEXT         NOT NULL
);

-- SEATS
CREATE TABLE seats (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id       UUID          REFERENCES trips(id) ON DELETE CASCADE,
  seat_number   VARCHAR(10)   NOT NULL,
  deck          VARCHAR(10)   NOT NULL CHECK (deck IN ('lower','upper')),
  status        VARCHAR(15)   NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','booked','blocked')),
  price         NUMERIC(10,2) NOT NULL,
  is_ladies     BOOLEAN       NOT NULL DEFAULT false,
  row_num       INT           NOT NULL,
  col_num       INT           NOT NULL,
  UNIQUE (trip_id, seat_number)
);

-- BOOKINGS
CREATE TABLE bookings (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID REFERENCES users(id)  ON DELETE CASCADE,
  trip_id            UUID REFERENCES trips(id)  ON DELETE CASCADE,
  boarding_point_id  UUID REFERENCES boarding_points(id),
  dropping_point_id  UUID REFERENCES dropping_points(id),
  pnr                VARCHAR(20)   UNIQUE NOT NULL,
  total_amount       NUMERIC(10,2) NOT NULL,
  status             VARCHAR(15)   NOT NULL DEFAULT 'confirmed'
                       CHECK (status IN ('confirmed','cancelled','pending')),
  contact_email      VARCHAR(150)  NOT NULL,
  contact_phone      VARCHAR(15)   NOT NULL,
  booked_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
  cancelled_at       TIMESTAMP
);

-- BOOKING SEATS
CREATE TABLE booking_seats (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id       UUID         REFERENCES bookings(id) ON DELETE CASCADE,
  seat_id          UUID         REFERENCES seats(id),
  seat_number      VARCHAR(10)  NOT NULL,
  passenger_name   VARCHAR(100) NOT NULL,
  passenger_age    INT          NOT NULL CHECK (passenger_age > 0 AND passenger_age < 120),
  passenger_gender VARCHAR(10)  NOT NULL
                     CHECK (passenger_gender IN ('Male','Female','Other'))
);

-- PAYMENT ORDERS
CREATE TABLE payment_orders (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id           UUID          REFERENCES bookings(id) ON DELETE CASCADE,
  razorpay_order_id    VARCHAR(100),
  razorpay_payment_id  VARCHAR(100),
  amount               NUMERIC(10,2) NOT NULL,
  currency             VARCHAR(5)    NOT NULL DEFAULT 'INR',
  status               VARCHAR(20)   NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','paid','failed','refunded')),
  created_at           TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_trips_route_date     ON trips(source, destination, travel_date);
CREATE INDEX idx_trips_bus_id         ON trips(bus_id);
CREATE INDEX idx_trips_date           ON trips(travel_date);
CREATE INDEX idx_seats_trip_id        ON seats(trip_id);
CREATE INDEX idx_seats_status         ON seats(trip_id, status);
CREATE INDEX idx_bookings_user_id     ON bookings(user_id);
CREATE INDEX idx_bookings_trip_id     ON bookings(trip_id);
CREATE INDEX idx_bookings_pnr         ON bookings(pnr);
CREATE INDEX idx_boarding_trip_id     ON boarding_points(trip_id);
CREATE INDEX idx_dropping_trip_id     ON dropping_points(trip_id);
CREATE INDEX idx_booking_seats_bk_id  ON booking_seats(booking_id);
CREATE INDEX idx_payment_orders_bk_id ON payment_orders(booking_id);

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════

-- Admin user  (password: Admin@123)
INSERT INTO users (name, email, phone, password, role) VALUES
  ('Admin User','admin@redbus.com','9999999999',
   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lkii',
   'admin');

-- Buses
INSERT INTO buses (id, name, operator_name, bus_type, total_seats, amenities,
                   cancellation_policy, refund_policy)
VALUES
  ('a1000000-0000-0000-0000-000000000001',
   'SRS Travels','SRS Travels Pvt. Ltd.','AC Sleeper',40,
   ARRAY['WiFi','Charging Point','Blanket','Water Bottle','Live Tracking'],
   'Free cancellation up to 2 hours before departure',
   '100% refund on cancellation 24h before'),

  ('a1000000-0000-0000-0000-000000000002',
   'Orange Tours','Orange Tours & Travels','AC Semi-Sleeper',44,
   ARRAY['Charging Point','Water Bottle','Reading Light'],
   'Free cancellation up to 4 hours before departure',
   '80% refund on cancellation 12h before'),

  ('a1000000-0000-0000-0000-000000000003',
   'VRL Travels','VRL Travels Ltd.','Non-AC Sleeper',36,
   ARRAY['Blanket','Water Bottle'],
   'No cancellation after booking','Non-refundable'),

  ('a1000000-0000-0000-0000-000000000004',
   'Kallada Travels','Kallada Travels','AC Sleeper',40,
   ARRAY['WiFi','Charging Point','Blanket','Water Bottle','Snacks','Live Tracking'],
   'Free cancellation up to 1 hour before departure',
   '100% refund on cancellation 24h before'),

  ('a1000000-0000-0000-0000-000000000005',
   'KSRTC Express','Karnataka State Road Transport','AC Seater',48,
   ARRAY['Charging Point','Water Bottle'],
   'Free cancellation up to 30 mins before departure',
   '90% refund on cancellation 2h before'),

  ('a1000000-0000-0000-0000-000000000006',
   'IntrCity SmartBus','IntrCity Pvt. Ltd.','AC Seater',44,
   ARRAY['WiFi','Charging Point','Water Bottle','Snacks'],
   'Free cancellation up to 1 hour before departure',
   '100% refund'),

  ('a1000000-0000-0000-0000-000000000007',
   'Chartered Bus','Chartered Bus Services','AC Sleeper',40,
   ARRAY['WiFi','Charging Point','Blanket','Water Bottle'],
   'Free cancellation up to 3 hours before departure',
   '90% refund on cancellation 12h before'),

  ('a1000000-0000-0000-0000-000000000008',
   'Neeta Tours','Neeta Tours & Travels','Non-AC Seater',44,
   ARRAY['Water Bottle'],
   'No cancellation','Non-refundable');

-- ─── Trips: Bangalore → Chennai (today) ──────────────────────────
INSERT INTO trips (bus_id,source,destination,departure_time,arrival_time,
                   duration,price,original_price,travel_date,available_seats,rating,review_count)
VALUES
  ('a1000000-0000-0000-0000-000000000001','Bangalore','Chennai',
   '21:00'::time,'06:30'::time,'9h 30m',899,1100,CURRENT_DATE,24,4.2,1892),

  ('a1000000-0000-0000-0000-000000000002','Bangalore','Chennai',
   '22:30'::time,'07:00'::time,'8h 30m',749,950,CURRENT_DATE,12,4.0,3241),

  ('a1000000-0000-0000-0000-000000000003','Bangalore','Chennai',
   '20:00'::time,'05:30'::time,'9h 30m',599,NULL,CURRENT_DATE,8,3.8,2100),

  ('a1000000-0000-0000-0000-000000000004','Bangalore','Chennai',
   '19:30'::time,'05:00'::time,'9h 30m',1050,1299,CURRENT_DATE,31,4.5,4567),

  ('a1000000-0000-0000-0000-000000000005','Bangalore','Chennai',
   '06:00'::time,'13:00'::time,'7h 00m',650,NULL,CURRENT_DATE,20,4.1,8900),

  ('a1000000-0000-0000-0000-000000000006','Bangalore','Chennai',
   '07:00'::time,'14:00'::time,'7h 00m',585,750,CURRENT_DATE,18,4.6,4100),

  ('a1000000-0000-0000-0000-000000000007','Bangalore','Chennai',
   '23:00'::time,'08:30'::time,'9h 30m',1045,1200,CURRENT_DATE,22,4.3,3800),

  ('a1000000-0000-0000-0000-000000000008','Bangalore','Chennai',
   '08:30'::time,'17:00'::time,'8h 30m',220,NULL,CURRENT_DATE,30,3.6,1500);

-- ─── Trips: Bangalore → Chennai (tomorrow) ───────────────────────
INSERT INTO trips (bus_id,source,destination,departure_time,arrival_time,
                   duration,price,original_price,travel_date,available_seats,rating,review_count)
VALUES
  ('a1000000-0000-0000-0000-000000000001','Bangalore','Chennai',
   '21:00'::time,'06:30'::time,'9h 30m',899,1100,CURRENT_DATE+1,32,4.2,1892),

  ('a1000000-0000-0000-0000-000000000002','Bangalore','Chennai',
   '22:30'::time,'07:00'::time,'8h 30m',749,950,CURRENT_DATE+1,28,4.0,3241),

  ('a1000000-0000-0000-0000-000000000004','Bangalore','Chennai',
   '19:30'::time,'05:00'::time,'9h 30m',1050,1299,CURRENT_DATE+1,40,4.5,4567),

  ('a1000000-0000-0000-0000-000000000006','Bangalore','Chennai',
   '07:00'::time,'14:00'::time,'7h 00m',585,750,CURRENT_DATE+1,44,4.6,4100);

-- ─── Trips: Mumbai → Pune ────────────────────────────────────────
INSERT INTO trips (bus_id,source,destination,departure_time,arrival_time,
                   duration,price,original_price,travel_date,available_seats,rating,review_count)
VALUES
  ('a1000000-0000-0000-0000-000000000005','Mumbai','Pune',
   '07:00'::time,'10:30'::time,'3h 30m',350,450,CURRENT_DATE,18,4.3,5421),

  ('a1000000-0000-0000-0000-000000000006','Mumbai','Pune',
   '10:00'::time,'13:30'::time,'3h 30m',320,NULL,CURRENT_DATE,22,4.1,2300),

  ('a1000000-0000-0000-0000-000000000007','Mumbai','Pune',
   '23:00'::time,'02:30'::time,'3h 30m',420,NULL,CURRENT_DATE,6,4.4,3200),

  ('a1000000-0000-0000-0000-000000000005','Mumbai','Pune',
   '07:00'::time,'10:30'::time,'3h 30m',350,450,CURRENT_DATE+1,40,4.3,5421),

  ('a1000000-0000-0000-0000-000000000006','Mumbai','Pune',
   '14:00'::time,'17:30'::time,'3h 30m',320,NULL,CURRENT_DATE+1,38,4.1,2300);

-- ─── Trips: Delhi → Jaipur ───────────────────────────────────────
INSERT INTO trips (bus_id,source,destination,departure_time,arrival_time,
                   duration,price,original_price,travel_date,available_seats,rating,review_count)
VALUES
  ('a1000000-0000-0000-0000-000000000001','Delhi','Jaipur',
   '22:00'::time,'04:30'::time,'6h 30m',750,900,CURRENT_DATE,15,4.2,6700),

  ('a1000000-0000-0000-0000-000000000006','Delhi','Jaipur',
   '06:30'::time,'12:00'::time,'5h 30m',599,NULL,CURRENT_DATE,28,4.6,4100),

  ('a1000000-0000-0000-0000-000000000004','Delhi','Jaipur',
   '21:00'::time,'03:30'::time,'6h 30m',900,1100,CURRENT_DATE+1,35,4.5,4567),

  ('a1000000-0000-0000-0000-000000000006','Delhi','Jaipur',
   '08:00'::time,'13:30'::time,'5h 30m',599,NULL,CURRENT_DATE+1,44,4.6,4100);

-- ─── Trips: Hyderabad → Bangalore ────────────────────────────────
INSERT INTO trips (bus_id,source,destination,departure_time,arrival_time,
                   duration,price,original_price,travel_date,available_seats,rating,review_count)
VALUES
  ('a1000000-0000-0000-0000-000000000007','Hyderabad','Bangalore',
   '20:30'::time,'06:00'::time,'9h 30m',950,1200,CURRENT_DATE,22,4.3,3800),

  ('a1000000-0000-0000-0000-000000000004','Hyderabad','Bangalore',
   '21:30'::time,'07:00'::time,'9h 30m',1050,1299,CURRENT_DATE,16,4.5,4567),

  ('a1000000-0000-0000-0000-000000000007','Hyderabad','Bangalore',
   '20:30'::time,'06:00'::time,'9h 30m',950,1200,CURRENT_DATE+1,40,4.3,3800);

-- ─── Boarding & Dropping points for ALL trips ────────────────────
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id, source, destination, departure_time, arrival_time FROM trips
  LOOP
    INSERT INTO boarding_points (trip_id, name, time, address) VALUES
      (t.id,
       t.source || ' Main Bus Stand',
       t.departure_time,
       'Central Bus Station, ' || t.source),
      (t.id,
       t.source || ' City Center',
       (t.departure_time + INTERVAL '30 minutes')::time,
       'City Center Stop, ' || t.source);

    INSERT INTO dropping_points (trip_id, name, time, address) VALUES
      (t.id,
       t.destination || ' Bus Terminal',
       t.arrival_time,
       'Main Bus Terminal, ' || t.destination),
      (t.id,
       t.destination || ' City Center',
       (t.arrival_time + INTERVAL '30 minutes')::time,
       'City Center Stop, ' || t.destination);
  END LOOP;
END $$;

-- ─── Verification ─────────────────────────────────────────────────
DO $$
DECLARE
  bc INT; tc INT; uc INT; bpc INT; dpc INT;
BEGIN
  SELECT COUNT(*) INTO bc  FROM buses;
  SELECT COUNT(*) INTO tc  FROM trips;
  SELECT COUNT(*) INTO uc  FROM users;
  SELECT COUNT(*) INTO bpc FROM boarding_points;
  SELECT COUNT(*) INTO dpc FROM dropping_points;
  RAISE NOTICE '✅ Migration complete:';
  RAISE NOTICE '   Buses:           %', bc;
  RAISE NOTICE '   Trips:           %', tc;
  RAISE NOTICE '   Boarding points: %', bpc;
  RAISE NOTICE '   Dropping points: %', dpc;
  RAISE NOTICE '   Users:           %', uc;
  RAISE NOTICE '   Admin: admin@redbus.com / Admin@123';
END $$;