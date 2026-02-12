using Microsoft.AspNetCore.Authentication.Negotiate;
using AtcoGenie.Server.Middleware;
using Microsoft.EntityFrameworkCore;
using AtcoGenie.Server.Data;
using AtcoGenie.Server.Application;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Add services to the container.
builder.Services.AddDbContext<ImdDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("ImdConnection")));

// Chat History & Folders: PostgreSQL (Persistent)
builder.Services.AddDbContext<AtcoGenie.Server.Infrastructure.Data.GenieDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("GenieConnection")));

// DEV ONLY: InMemory Database (Chats lost on restart) - DISABLED
// builder.Services.AddDbContext<AtcoGenie.Server.Infrastructure.Data.GenieDbContext>(options =>
//     options.UseInMemoryDatabase("GenieChats"));

builder.Services.AddScoped<AtcoGenie.Server.Application.Services.IChatHistoryService, AtcoGenie.Server.Application.Services.ChatHistoryService>();
builder.Services.AddScoped<AtcoGenie.Server.Application.Services.IFolderService, AtcoGenie.Server.Application.Services.FolderService>();

builder.Services.AddApplicationServices();

// Fix for ChatPersistence: Handle Entity Framework circular references in JSON
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
});

builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme)
   .AddNegotiate();

builder.Services.AddHostedService<AtcoGenie.Server.Services.IdentitySyncService>();

builder.Services.AddAuthorization(options =>
{
   // By default, all requests require the user to be authenticated.
   options.FallbackPolicy = options.DefaultPolicy;
});

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

// Serve SPA static files (Module 3 Frontend)
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
// app.UseMiddleware<MockAuthMiddleware>(); // DISABLED FOR DEPLOYMENT (Use Real Windows Auth)

// DIAGNOSTIC: Log auth headers for troubleshooting
app.Use(async (context, next) =>
{
    var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
    
    // Low noise level
    // logger.LogWarning("Request: {Method} {Path} User: {User}", context.Request.Method, context.Request.Path, context.User.Identity?.Name);
    
    await next();
});

app.UseMiddleware<GatekeeperMiddleware>(); // Hydrate Identity
app.UseAuthorization();

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

// MANUAL SYNC TRIGGER: Forces the IdentitySyncService to run immediately
app.MapGet("/api/sync/trigger", async (IEnumerable<IHostedService> hostedServices, CancellationToken ct) =>
{
    var syncService = hostedServices.OfType<AtcoGenie.Server.Services.IdentitySyncService>().FirstOrDefault();
    if (syncService == null) return Results.NotFound("Sync Service not registered.");

    await syncService.SyncIdentitiesAsync(ct);
    return Results.Ok(new { Message = "Identity Sync triggered successfully at " + DateTime.Now.ToString() });
});

app.MapGet("/weatherforecast", () =>
{
    var forecast =  Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

// DIAGNOSTIC: Who Am I? (Verifies Auth + Gatekeeper)
app.MapGet("/api/whoami", (HttpContext context) =>
{
    var user = context.User;
    
    var info = new
    {
        IsAuthenticated = user.Identity?.IsAuthenticated ?? false,
        Name = user.Identity?.Name ?? "Anonymous",
        AuthType = user.Identity?.AuthenticationType ?? "None",
        Claims = user.Claims.Select(c => new { c.Type, c.Value }).ToList(),
        
        // This claim is injected by our 'GatekeeperMiddleware' if IMD lookup succeeded
        HcmsEmployeeId = user.FindFirst("Genie:HcmsId")?.Value ?? "NOT FOUND (Hydration Failed)",
        
        Message = user.Identity?.IsAuthenticated == true 
            ? "✅ You are logged in!" 
            : "❌ You are NOT logged in. (Check Windows Auth / Browser Settings)"
    };
    
    return info;
}); 

// DIAGNOSTIC: Test AI Connection (Returns raw Google API error)
app.MapGet("/api/test-ai-connection", async (AtcoGenie.Server.Application.Services.IGeminiService gemini, CancellationToken ct) =>
{
    var testRequest = new AtcoGenie.Server.Application.Services.GeminiRequest
    {
        Contents = new List<AtcoGenie.Server.Application.Services.GeminiContent>
        {
            new AtcoGenie.Server.Application.Services.GeminiContent 
            { 
                Role = "user", 
                Parts = new List<AtcoGenie.Server.Application.Services.GeminiPart> { new AtcoGenie.Server.Application.Services.GeminiPart { Text = "Ping" } } 
            }
        }
    };
    
    var response = await gemini.GenerateContentAsync(testRequest, ct);
    
    return new
    {
        Success = response.Success,
        Result = response.Text,
        Error = response.Error,
        FinishReason = response.FinishReason,
        Diagnosis = response.Success && !response.Text!.Contains("Demo Mode") 
            ? "✅ AI is connected and working!" 
            : "❌ AI is disconnected. Check VM Firewall or API Key."
    };
}).AllowAnonymous();

// MODULE 2 TEST: Orchestration + Session Context + Partial Failure Handling
app.MapGet("/api/test-orchestration", async (AtcoGenie.Server.Application.Services.OrchestrationService orchestrator) =>
{
    var testQuery = new AtcoGenie.Server.Application.DTOs.UserQuery
    {
        Prompt = "Test partial failure handling",
        RequiredSources = new List<string> 
        { 
            "HcmsConnection",      // Valid - should succeed
            "InvalidConnection",   // Invalid - should fail gracefully
            "ImdConnection"        // Valid - should succeed
        }
    };
    
    var result = await orchestrator.ExecuteAsync(testQuery);
    
    return new
    {
        TotalSources = result.TotalSources,
        SuccessfulCount = result.SuccessfulResults.Count(),
        FailedCount = result.FailedSources.Count(),
        FailedSources = result.FailedSources,
        HasPartialFailure = result.HasPartialFailure,
        Data = result.Data,
        Message = result.HasPartialFailure 
            ? "⚠️ Partial success - some data sources failed but operation completed"
            : "✅ All data sources responded successfully"
    };
});

// MODULE 3 TEST: Schema Registry
app.MapGet("/api/schema", async (AtcoGenie.Server.Application.Services.ISchemaService schemaService) =>
{
    return await schemaService.GetSchemasAsync();
});

// MAIN GENIE API: Query endpoint
app.MapPost("/api/query", async (
    AtcoGenie.Server.Application.DTOs.GenieQueryRequest request,
    AtcoGenie.Server.Application.Services.IGenieQueryService queryService) =>
{
    var response = await queryService.QueryAsync(request);
    return response;
});

// --- CHAT HISTORY API ---

// Register DB Context (InMemory for Prototype)
// Note: In Production, switch to SQL Server:
// builder.Services.AddDbContext<GenieDbContext>(options => options.UseSqlServer(builder.Configuration.GetConnectionString("GenieConnection")));

app.MapGet("/api/chats", async (string? archived, AtcoGenie.Server.Application.Services.IChatHistoryService chatService, HttpContext context) =>
{
    // USER ISOLATION: Prefer mapped EmployeeId, otherwise use Windows Auth Name
    var userId = context.User.FindFirst("Genie:HcmsId")?.Value 
                 ?? context.User.Identity?.Name 
                 ?? "Anonymous";
                 
    bool isArchived = archived?.ToLower() == "true";
    return await chatService.GetUserSessionsAsync(userId, isArchived);
});

// SEARCH: Query across all chat titles and message content
app.MapGet("/api/chats/search", async (string? q, AtcoGenie.Server.Application.Services.IChatHistoryService chatService, HttpContext context) =>
{
    var userId = context.User.FindFirst("Genie:HcmsId")?.Value 
                 ?? context.User.Identity?.Name 
                 ?? "Anonymous";
                 
    return await chatService.SearchSessionsAsync(userId, q ?? "");
});

app.MapGet("/api/chats/{id}", async (int id, AtcoGenie.Server.Application.Services.IChatHistoryService chatService, HttpContext context) =>
{
    var userId = context.User.FindFirst("Genie:HcmsId")?.Value 
                 ?? context.User.Identity?.Name 
                 ?? "Anonymous";

    var session = await chatService.GetSessionAsync(id);
    
    // SECURITY CHECK: Ensure user owns this session (IDOR Protection)
    if (session != null && session.UserId != userId)
    {
        return Results.Forbid();
    }

    return session is not null ? Results.Ok(session) : Results.NotFound();
});

app.MapPost("/api/chats", async (AtcoGenie.Server.Application.Services.IChatHistoryService chatService, HttpContext context) =>
{
    var userId = context.User.FindFirst("Genie:HcmsId")?.Value 
                 ?? context.User.Identity?.Name 
                 ?? "Anonymous";
                 
    var session = await chatService.CreateSessionAsync(userId, "New Chat", "gemini-3-pro");
    return Results.Created($"/api/chats/{session.Id}", session);
});

app.MapPost("/api/chats/{id}/messages", async (int id, AtcoGenie.Server.Domain.Entities.ChatMessage message, AtcoGenie.Server.Application.Services.IChatHistoryService chatService) =>
{
    await chatService.AddMessageAsync(id, message.Sender, message.Content);
    return Results.Ok();
});

app.MapPut("/api/chats/{id}/rename", async (int id, string title, AtcoGenie.Server.Application.Services.IChatHistoryService chatService) =>
{
    await chatService.RenameSessionAsync(id, title);
    return Results.Ok();
});

app.MapPut("/api/chats/{id}/archive", async (int id, AtcoGenie.Server.Application.Services.IChatHistoryService chatService) =>
{
    await chatService.ArchiveSessionAsync(id);
    return Results.Ok();
});

app.MapPut("/api/chats/{id}/unarchive", async (int id, AtcoGenie.Server.Application.Services.IChatHistoryService chatService) =>
{
    await chatService.UnarchiveSessionAsync(id);
    return Results.Ok();
});

app.MapDelete("/api/chats/{id}", async (int id, AtcoGenie.Server.Application.Services.IChatHistoryService chatService) =>
{
    await chatService.DeleteSessionAsync(id);
    return Results.Ok();
});

// ===== FOLDER MANAGEMENT API =====

// GET: Retrieve all folders for current user
app.MapGet("/api/folders", async (AtcoGenie.Server.Application.Services.IFolderService folderService, HttpContext context) =>
{
    var userId = context.User.FindFirst("Genie:HcmsId")?.Value 
                 ?? context.User.Identity?.Name 
                 ?? "Anonymous";
                 
    return Results.Ok(await folderService.GetUserFoldersAsync(userId));
});

// POST: Create new folder
app.MapPost("/api/folders", async (AtcoGenie.Server.Application.DTOs.FolderDto request, AtcoGenie.Server.Application.Services.IFolderService folderService, HttpContext context) =>
{
    var userId = context.User.FindFirst("Genie:HcmsId")?.Value 
                 ?? context.User.Identity?.Name 
                 ?? "Anonymous";
    
    try
    {
        var folder = await folderService.CreateFolderAsync(userId, request.Name);
        return Results.Created($"/api/folders/{folder.Id}", folder);
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// PUT: Rename folder
app.MapPut("/api/folders/{id}/rename", async (int id, string name, AtcoGenie.Server.Application.Services.IFolderService folderService) =>
{
    try
    {
        var folder = await folderService.RenameFolderAsync(id, name);
        return Results.Ok(folder);
    }
    catch (KeyNotFoundException)
    {
        return Results.NotFound();
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// DELETE: Delete folder (does NOT delete chats)
app.MapDelete("/api/folders/{id}", async (int id, AtcoGenie.Server.Application.Services.IFolderService folderService) =>
{
    try
    {
        await folderService.DeleteFolderAsync(id);
        return Results.Ok();
    }
    catch (KeyNotFoundException)
    {
        return Results.NotFound();
    }
});

// POST: Add chat to folder (drag-and-drop)
app.MapPost("/api/folders/{folderId}/chats/{chatId}", async (int folderId, int chatId, AtcoGenie.Server.Application.Services.IFolderService folderService) =>
{
    try
    {
        await folderService.AddChatToFolderAsync(folderId, chatId);
        return Results.Ok();
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

// DELETE: Remove chat from folder (does NOT delete chat)
app.MapDelete("/api/folders/{folderId}/chats/{chatId}", async (int folderId, int chatId, AtcoGenie.Server.Application.Services.IFolderService folderService) =>
{
    await folderService.RemoveChatFromFolderAsync(folderId, chatId);
    return Results.Ok();
});

// GET: Get all chats in a folder
app.MapGet("/api/folders/{id}/chats", async (int id, AtcoGenie.Server.Application.Services.IFolderService folderService) =>
{
    var chats = await folderService.GetFolderChatsAsync(id);
    return Results.Ok(chats);
});


// Initialize Database
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILogger<Program>>();
    
    try
    {
        var context = services.GetRequiredService<ImdDbContext>();
        // EnsureCreated creates the database if it doesn't exist (easiest for dev)
        // Note: In production, use Migrations instead
        context.Database.EnsureCreated();
        
        logger.LogInformation("IMD Database initialized successfully.");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "An error occurred creating the IMD database.");
    }
    
    // Initialize Genie chat & folders database (optional - won't block app startup if DB unavailable)
    try
    {
        var genieDb = services.GetRequiredService<AtcoGenie.Server.Infrastructure.Data.GenieDbContext>();
        genieDb.Database.EnsureCreated(); // Creates tables if they don't exist
        logger.LogInformation("Genie Database initialized successfully.");
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Genie Database initialization failed - folders feature will not work. Check GenieConnection in appsettings.json");
        // Don't throw - allow app to start even if Genie DB is unavailable
    }
}

// SPA Fallback (Must be last)
app.MapFallbackToFile("index.html").AllowAnonymous();

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
