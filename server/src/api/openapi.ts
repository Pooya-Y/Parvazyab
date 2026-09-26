/**
 * OpenAPI 3.1 description of the agency API (/api/v1), served at
 * /api/v1/openapi.json. Kept by hand next to the routes it describes; the
 * integration tests check that every documented path answers.
 */
const listingProperties = {
  originCode: { type: "string", example: "THR", description: "IATA code of an airport Parvazyab knows." },
  destinationCode: { type: "string", example: "MHD" },
  airline: { type: "string", example: "ماهان ایر", description: "Spelling variants are normalized." },
  flightNo: { type: "string", example: "W5-1071", maxLength: 16 },
  departAt: {
    type: "string",
    format: "date-time",
    example: "2026-10-05T08:30:00+03:30",
    description: "ISO 8601 with an offset (or epoch milliseconds on input).",
  },
  arriveAt: { type: "string", format: "date-time", example: "2026-10-05T10:00:00+03:30" },
  stops: { type: "integer", minimum: 0, maximum: 3, default: 0 },
  cabin: { type: "string", enum: ["economy", "business"] },
  fareType: { type: "string", enum: ["scheduled", "charter"], default: "scheduled" },
  priceToman: { type: "integer", minimum: 1, example: 2450000 },
  bookingUrl: { type: "string", format: "uri", description: "http(s) link where the traveller buys this fare." },
  isActive: { type: "boolean", default: true },
} as const;

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Parvazyab agency API",
    version: "1.0.0",
    description:
      "Publish and update an agency's flight listings on Parvazyab. Authenticate with an API key " +
      "created in the dashboard (Authorization: Bearer pvz_…). Listings are matched to existing ones by " +
      "route, airline, flight number and departure minute, so sending the same flight again updates it. " +
      "Rate limit: 120 requests a minute per key.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ apiKey: [] }],
  paths: {
    "/listings": {
      get: {
        summary: "List this agency's listings",
        responses: {
          "200": {
            description: "All listings, soonest departure first.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "array", items: { $ref: "#/components/schemas/Listing" } } },
                },
              },
            },
          },
          "401": errorResponse,
        },
      },
      put: {
        summary: "Create or update listings in bulk (up to 2000)",
        parameters: [
          {
            name: "dryRun",
            in: "query",
            schema: { type: "boolean", default: false },
            description: "Validate and report what would happen, without writing.",
          },
          {
            name: "skipInvalid",
            in: "query",
            schema: { type: "boolean", default: false },
            description: "Write the valid rows even if some rows have errors (otherwise nothing is written).",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["listings"],
                properties: { listings: { type: "array", items: { $ref: "#/components/schemas/ListingInput" } } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "What happened to each row.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ImportReport" } } },
          },
          "422": {
            description: "Some rows have errors and skipInvalid was not set; nothing was written.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ImportReport" } } },
          },
          "400": errorResponse,
          "401": errorResponse,
          "413": errorResponse,
        },
      },
    },
    "/listings/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      patch: {
        summary: "Change a listing's price, link or visibility",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                minProperties: 1,
                properties: {
                  priceToman: listingProperties.priceToman,
                  bookingUrl: listingProperties.bookingUrl,
                  isActive: listingProperties.isActive,
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "The updated listing.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Listing" } } },
          },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
        },
      },
      delete: {
        summary: "Delete a listing",
        responses: { "204": { description: "Deleted." }, "401": errorResponse, "404": errorResponse },
      },
    },
  },
  components: {
    securitySchemes: {
      apiKey: { type: "http", scheme: "bearer", description: "A key from the dashboard: pvz_<prefix>_<secret>." },
    },
    schemas: {
      ListingInput: {
        type: "object",
        required: [
          "originCode",
          "destinationCode",
          "airline",
          "flightNo",
          "departAt",
          "arriveAt",
          "cabin",
          "priceToman",
          "bookingUrl",
        ],
        properties: listingProperties,
      },
      Listing: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          ...listingProperties,
          departAt: { type: "string", format: "date-time" },
          arriveAt: { type: "string", format: "date-time" },
          durationMin: { type: "integer" },
        },
      },
      ImportReport: {
        type: "object",
        properties: {
          committed: { type: "boolean" },
          counts: {
            type: "object",
            properties: {
              create: { type: "integer" },
              update: { type: "integer" },
              unchanged: { type: "integer" },
              error: { type: "integer" },
            },
          },
          rows: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ref: { type: "integer", description: "Index in the request's listings array." },
                action: { type: "string", enum: ["create", "update", "unchanged", "error"] },
                errors: {
                  type: "array",
                  items: { type: "string" },
                  description: 'Codes such as "departAt: DEPARTURE_IN_PAST" or "originCode: UNKNOWN_AIRPORT".',
                },
                id: { type: "string", format: "uuid", description: "The listing, once it exists." },
              },
            },
          },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string", example: "INVALID_API_KEY" },
          details: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;
