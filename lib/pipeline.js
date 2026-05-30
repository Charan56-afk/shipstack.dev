// ============================================================
// SCHEMA DEFINITIONS
// ============================================================
export const MASTER_SCHEMA = {
  intent: {
    required: ["app_name", "app_type", "features", "entities", "roles", "integrations"],
  },
  design: {
    required: ["entities", "flows", "roles", "pages", "api_groups"],
  },
  schema: {
    required: ["database", "api", "ui", "auth"],
  },
};

// ============================================================
// STAGE PROMPTS
// ============================================================
export const STAGE_PROMPTS = {
  intent: (userInput) => `You are Stage 1 of an app compiler pipeline. Extract structured intent from the user's description.

USER INPUT: "${userInput}"

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "app_name": "string - a concise app name",
  "app_type": "string - e.g. CRM, E-commerce, Dashboard, SaaS",
  "description": "string - one sentence summary",
  "features": ["array of feature strings"],
  "entities": ["array of main data entities e.g. User, Product, Order"],
  "roles": ["array of user roles e.g. admin, user, guest"],
  "integrations": ["array of third-party needs e.g. payments, email, auth"],
  "assumptions": ["array of assumptions made for vague requirements"],
  "clarifications_needed": ["array of things that were unclear - may be empty"]
}`,

  design: (intent) => `You are Stage 2 of an app compiler pipeline. Convert extracted intent into system architecture.

INTENT: ${JSON.stringify(intent, null, 2)}

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "entities": [
    {
      "name": "string",
      "fields": [{"name": "string", "type": "string - uuid/string/text/integer/boolean/timestamp/decimal/json", "required": true, "unique": false}],
      "relations": [{"entity": "string", "type": "hasMany|belongsTo|manyToMany"}]
    }
  ],
  "roles": [
    {
      "name": "string",
      "permissions": ["string - e.g. contacts:read, contacts:write, admin:all"]
    }
  ],
  "flows": [
    {
      "name": "string",
      "steps": ["string array describing the flow"]
    }
  ],
  "pages": [
    {
      "name": "string",
      "path": "string - URL path",
      "auth_required": true,
      "allowed_roles": ["string"],
      "components": ["string - component names on this page"]
    }
  ],
  "api_groups": [
    {
      "resource": "string",
      "base_path": "string",
      "operations": ["list|get|create|update|delete|custom"]
    }
  ]
}`,

  schema: (design, intent) => `You are Stage 3 of an app compiler pipeline. Generate complete production-ready schemas.

INTENT: ${JSON.stringify(intent, null, 2)}
DESIGN: ${JSON.stringify(design, null, 2)}

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "database": {
    "tables": [
      {
        "name": "string - snake_case table name",
        "columns": [
          {"name": "string", "type": "string - SQL type", "nullable": false, "default": null, "primary_key": false, "foreign_key": null}
        ],
        "indexes": [{"columns": ["string"], "unique": false}]
      }
    ],
    "relations": [
      {"from_table": "string", "from_column": "string", "to_table": "string", "to_column": "string", "type": "one_to_many|many_to_many|one_to_one"}
    ]
  },
  "api": {
    "version": "v1",
    "base_url": "/api/v1",
    "auth_method": "JWT",
    "endpoints": [
      {
        "path": "string",
        "method": "GET|POST|PUT|DELETE|PATCH",
        "description": "string",
        "auth_required": true,
        "allowed_roles": ["string"],
        "request_body": {"field_name": "type_string"},
        "response_schema": {"field_name": "type_string"},
        "db_table": "string"
      }
    ]
  },
  "ui": {
    "theme": {
      "primary_color": "#hex",
      "secondary_color": "#hex",
      "font_family": "string"
    },
    "pages": [
      {
        "name": "string",
        "path": "string",
        "layout": "string - auth|dashboard|public",
        "auth_required": true,
        "allowed_roles": ["string"],
        "components": [
          {
            "type": "string - DataTable|Form|Chart|StatCard|Modal|Navbar|Sidebar|Button|Input|Select",
            "name": "string",
            "props": {},
            "api_binding": "string"
          }
        ]
      }
    ]
  },
  "auth": {
    "provider": "string - jwt|oauth|session",
    "token_expiry": "string",
    "roles": ["string"],
    "rules": [
      {
        "role": "string",
        "resource": "string",
        "actions": ["read|write|delete|admin"]
      }
    ],
    "protected_routes": ["string"]
  }
}`,

  refinement: (schema, intent, design) => {
    const minimalIntent = {
      app_name: intent?.app_name,
      features: intent?.features
    };
    const minimalDesign = {
      pages: design?.pages?.map(p => ({ name: p.name, path: p.path }))
    };
    return `You are Stage 4 of an app compiler pipeline. Find and fix ALL inconsistencies.

ORIGINAL INTENT: ${JSON.stringify(minimalIntent, null, 2)}
DESIGN: ${JSON.stringify(minimalDesign, null, 2)}
GENERATED SCHEMA: ${JSON.stringify(schema, null, 2)}

Check and fix:
1. API endpoints reference DB tables that don't exist → add missing tables
2. UI components call API endpoints that don't exist → add missing endpoints
3. Auth roles in UI pages don't match auth.roles → normalize them
4. Missing primary keys in DB tables → add id columns
5. Foreign keys reference non-existent tables → fix references
6. Required features from intent not covered → add endpoints
7. Pages in UI not matching pages in design → reconcile

Return ONLY the corrected complete schema JSON (same structure). No markdown, no explanation.`;
  },
};

// ============================================================
// VALIDATOR ENGINE
// ============================================================
export class ValidatorEngine {
  static validate(data, stage) {
    const errors = [];

    if (!data || typeof data !== "object") {
      return [{ type: "INVALID_JSON", message: "Output is not a valid object", fixable: true }];
    }

    const required = MASTER_SCHEMA[stage]?.required || [];
    for (const field of required) {
      if (!(field in data)) {
        errors.push({ type: "MISSING_FIELD", field, message: `Missing required field: ${field}`, fixable: true });
      }
    }

    if (stage === "schema") {
      errors.push(...this.validateCrossLayer(data));
    }

    return errors;
  }

  static validateCrossLayer(schema) {
    const errors = [];

    if (!schema.database?.tables || !schema.api?.endpoints || !schema.ui?.pages || !schema.auth?.roles) {
      return [{ type: "MISSING_LAYER", message: "One or more schema layers missing", fixable: true }];
    }

    const tableNames = new Set(schema.database.tables.map((t) => t.name));
    const endpointPaths = new Set(schema.api.endpoints.map((e) => e.path));
    const authRoles = new Set(schema.auth.roles);

    for (const ep of schema.api.endpoints) {
      if (ep.db_table && !tableNames.has(ep.db_table)) {
        errors.push({
          type: "CROSS_LAYER_MISMATCH",
          message: `API endpoint ${ep.path} references non-existent table: ${ep.db_table}`,
          fixable: true,
          layer: "database",
        });
      }
    }

    for (const page of schema.ui.pages) {
      for (const comp of page.components || []) {
        if (comp.api_binding && comp.api_binding !== "none" && comp.api_binding !== "") {
          const bound = comp.api_binding;
          const exists = [...endpointPaths].some((p) => p.includes(bound.split(" ").pop()));
          if (!exists) {
            errors.push({
              type: "CROSS_LAYER_MISMATCH",
              message: `UI component ${comp.name} on page ${page.name} binds to missing API: ${bound}`,
              fixable: true,
              layer: "api",
            });
          }
        }
      }
    }

    for (const page of schema.ui.pages) {
      for (const role of page.allowed_roles || []) {
        if (!authRoles.has(role) && role !== "all" && role !== "*") {
          errors.push({
            type: "ROLE_MISMATCH",
            message: `Page ${page.name} allows role "${role}" not in auth.roles`,
            fixable: true,
            layer: "auth",
          });
        }
      }
    }

    return errors;
  }
}

// ============================================================
// CLAUDE API CALLER (uses local proxy route)
// ============================================================
export async function callClaude(prompt, systemMsg = "You are a precise app compiler. Always return valid JSON only.") {
  const response = await fetch("/api/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemMsg,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  const text = data.content.map((b) => b.text || "").join("");
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not parse JSON from response");
  }
}

// ============================================================
// PIPELINE ORCHESTRATOR
// ============================================================
export async function runPipeline(userInput, onStageUpdate) {
  const results = { intent: null, design: null, schema: null, final: null };
  const metrics = { startTime: Date.now(), retries: 0, errors: [], stageTimings: {} };

  const runStage = async (stageName, promptFn, args, maxRetries = 2) => {
    const stageStart = Date.now();
    onStageUpdate(stageName, "running", null, []);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const prompt = promptFn(...args);
        const result = await callClaude(prompt);
        const errors = ValidatorEngine.validate(result, stageName);

        if (errors.length === 0) {
          metrics.stageTimings[stageName] = Date.now() - stageStart;
          onStageUpdate(stageName, "done", result, []);
          return result;
        }

        if (attempt < maxRetries) {
          metrics.retries++;
          onStageUpdate(stageName, "retrying", null, errors);
          await new Promise((r) => setTimeout(r, 500));
        } else {
          metrics.errors.push(...errors);
          metrics.stageTimings[stageName] = Date.now() - stageStart;
          onStageUpdate(stageName, "done_with_warnings", result, errors);
          return result;
        }
      } catch (err) {
        if (attempt === maxRetries) {
          metrics.stageTimings[stageName] = Date.now() - stageStart;
          onStageUpdate(stageName, "error", null, [{ type: "EXCEPTION", message: err.message }]);
          throw err;
        }
        metrics.retries++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  };

  results.intent = await runStage("intent", STAGE_PROMPTS.intent, [userInput]);
  results.design = await runStage("design", STAGE_PROMPTS.design, [results.intent]);
  results.schema = await runStage("schema", STAGE_PROMPTS.schema, [results.design, results.intent]);

  // Validate the Stage 3 schema first. If it's already consistent and error-free,
  // we can complete refinement immediately without calling the LLM.
  const schemaErrors = ValidatorEngine.validate(results.schema, "schema");
  if (schemaErrors.length === 0) {
    onStageUpdate("refinement", "done", results.schema, []);
    results.final = results.schema;
  } else {
    results.final = await runStage("refinement", STAGE_PROMPTS.refinement, [results.schema, results.intent, results.design], 1);
  }

  metrics.totalTime = Date.now() - metrics.startTime;
  return { results, metrics };
}

// ============================================================
// EVALUATION PROMPTS
// ============================================================
export const EVAL_PROMPTS = {
  standard: [
    "Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics.",
    "Create an e-commerce platform with product listings, shopping cart, checkout with Stripe, order tracking, and vendor dashboard.",
    "Build a project management tool like Jira with tickets, sprints, kanban board, team members, and time tracking.",
    "Create a learning management system with courses, lessons, quizzes, student progress tracking, and instructor dashboards.",
    "Build a healthcare appointment booking system with doctors, patients, scheduling, reminders, and medical records.",
  ],
  edge: [
    "build app",
    "I need something for my business to track stuff and maybe sell things online with users",
    "Create a social media platform AND a CRM AND an e-commerce store AND a video streaming service all in one",
    "Build the same thing as Slack but better",
    "Make an app where users can login and do things based on their role",
  ],
};
