import swaggerJsdoc  from 'swagger-jsdoc';
import swaggerUi     from 'swagger-ui-express';
import { Express }   from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'RedBus Clone API',
      version:     '1.0.0',
      description: 'Full REST API for RedBus Clone — Bus Ticket Booking Application',
      contact: {
        name:  'RedBus Dev Team',
        email: 'dev@redbus-clone.com',
      },
    },
    servers: [
      { url: 'http://localhost:5000/api', description: 'Development server' },
      { url: 'https://red-bus-backend-tosi.onrender.com/api', description: 'Production server' },
    ],
    tags: [
      { name: 'Auth',     description: 'Authentication endpoints'   },
      { name: 'Buses',    description: 'Bus search & details'       },
      { name: 'Seats',    description: 'Seat availability'          },
      { name: 'Bookings', description: 'Booking management'         },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type:         'http',
          scheme:       'bearer',
          bearerFormat: 'JWT',
          description:  'Enter your JWT token. Get it from /api/auth/login',
        },
      },
      schemas: {
        // ── Auth ──────────────────────────────
        SignupRequest: {
          type: 'object',
          required: ['name','email','password'],
          properties: {
            name:     { type: 'string', example: 'Rahul Sharma'       },
            email:    { type: 'string', example: 'rahul@example.com'  },
            password: { type: 'string', example: 'Password@123'       },
            phone:    { type: 'string', example: '9876543210'         },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email','password'],
          properties: {
            email:    { type: 'string', example: 'rahul@example.com' },
            password: { type: 'string', example: 'Password@123'      },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                token: { type: 'string' },
                user: {
                  type: 'object',
                  properties: {
                    id:    { type: 'string' },
                    name:  { type: 'string' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    role:  { type: 'string' },
                  },
                },
              },
            },
          },
        },
        // ── Bus ───────────────────────────────
        Trip: {
          type: 'object',
          properties: {
            id:             { type: 'string'  },
            bus_name:       { type: 'string'  },
            operator_name:  { type: 'string'  },
            bus_type:       { type: 'string'  },
            source:         { type: 'string'  },
            destination:    { type: 'string'  },
            departure_time: { type: 'string'  },
            arrival_time:   { type: 'string'  },
            duration:       { type: 'string'  },
            price:          { type: 'number'  },
            original_price: { type: 'number'  },
            travel_date:    { type: 'string'  },
            available_seats:{ type: 'integer' },
            total_seats:    { type: 'integer' },
            rating:         { type: 'number'  },
            review_count:   { type: 'integer' },
            amenities:      { type: 'array', items: { type: 'string' } },
          },
        },
        // ── Seat ──────────────────────────────
        Seat: {
          type: 'object',
          properties: {
            id:          { type: 'string' },
            seat_number: { type: 'string' },
            deck:        { type: 'string', enum: ['lower','upper'] },
            status:      { type: 'string', enum: ['available','booked','blocked'] },
            price:       { type: 'number'  },
            is_ladies:   { type: 'boolean' },
            row_num:     { type: 'integer' },
            col_num:     { type: 'integer' },
          },
        },
        // ── Booking ───────────────────────────
        BookingRequest: {
          type: 'object',
          required: ['tripId','selectedSeats','passengers','boardingPointId','droppingPointId','contactEmail','contactPhone'],
          properties: {
            tripId:           { type: 'string'  },
            boardingPointId:  { type: 'string'  },
            droppingPointId:  { type: 'string'  },
            contactEmail:     { type: 'string'  },
            contactPhone:     { type: 'string'  },
            totalAmount:      { type: 'number'  },
            selectedSeats:    { type: 'array', items: { type: 'string' } },
            passengers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name:        { type: 'string'  },
                  age:         { type: 'integer' },
                  gender:      { type: 'string', enum: ['Male','Female','Other'] },
                  seatNumber:  { type: 'string'  },
                },
              },
            },
          },
        },
        // ── Error ─────────────────────────────
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error:   { type: 'string',  example: 'Something went wrong' },
          },
        },
      },
    },
  },
  // Scan all route files for JSDoc comments
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Express): void => {
  // Swagger UI
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'RedBus API Docs',
    customCss: `
      .swagger-ui .topbar { background: #d63031; }
      .swagger-ui .topbar-wrapper img { content: url(''); }
      .swagger-ui .topbar-wrapper::before {
        content: '🚌 RedBus API'; color: white;
        font-size: 1.2rem; font-weight: bold;
      }
    `,
    swaggerOptions: {
      persistAuthorization: true,  // keeps token across page refresh
      displayRequestDuration: true,
    },
  }));

  // Raw JSON spec endpoint (for Postman import)
  app.get('/api/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('📚 Swagger docs: http://localhost:5000/api/docs');
};