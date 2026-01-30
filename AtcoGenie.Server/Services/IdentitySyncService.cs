using System.DirectoryServices;
// using Microsoft.Data.SqlClient; // Assuming direct SQL for HCMS

namespace AtcoGenie.Server.Services;

public class IdentitySyncService : BackgroundService
{
    private readonly ILogger<IdentitySyncService> _logger;
    private readonly IConfiguration _config;
    private readonly IServiceProvider _serviceProvider;

    public IdentitySyncService(ILogger<IdentitySyncService> logger, IConfiguration config, IServiceProvider serviceProvider)
    {
        _logger = logger;
        _config = config;
        _serviceProvider = serviceProvider;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Identity Sync Service started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                _logger.LogInformation("Starting nightly sync at {Time}", DateTimeOffset.Now);

                await SyncIdentitiesAsync(stoppingToken);

                // Wait for 24 hours (or configurable interval)
                await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during Identity Sync.");
                await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken);
            }
        }
    }

    private async Task SyncIdentitiesAsync(CancellationToken stoppingToken)
    {
        var adUsersRaw = FetchAdUsers();
        _logger.LogInformation("Fetched {Count} users from AD.", adUsersRaw.Count);

        // Deduplicate AD by email (take first occurrence)
        var adUsers = adUsersRaw
            .Where(u => !string.IsNullOrEmpty(u.Email))
            .GroupBy(u => u.Email.ToLower())
            .Select(g => g.First())
            .ToDictionary(u => u.Email.ToLower());
        _logger.LogInformation("After AD deduplication: {Count} unique AD emails.", adUsers.Count);

        var hcmsEmployees = await FetchHcmsEmployeesAsync(stoppingToken);
        _logger.LogInformation("Fetched {Count} employees from HCMS.", hcmsEmployees.Count);

        // Deduplicate HCMS by email (take first occurrence)
        var hcmsDeduped = hcmsEmployees
            .Where(e => !string.IsNullOrEmpty(e.Email))
            .GroupBy(e => e.Email.ToLower())
            .Select(g => g.First())
            .ToDictionary(e => e.Email.ToLower());
        _logger.LogInformation("After HCMS deduplication: {Count} unique HCMS emails.", hcmsDeduped.Count);

        // Find matching emails (present in both AD and HCMS)
        var matchedEmails = adUsers.Keys.Intersect(hcmsDeduped.Keys).ToList();
        _logger.LogInformation("Found {Count} matches (AD + HCMS).", matchedEmails.Count);

        using (var scope = _serviceProvider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtcoGenie.Server.Data.ImdDbContext>();
            
            foreach (var emailKey in matchedEmails) 
            {
                 var adUser = adUsers[emailKey];
                 var hcmsEmployee = hcmsDeduped[emailKey];
                 
                 var existing = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstOrDefaultAsync(db.UserMappings, u => u.Email.ToLower() == emailKey, stoppingToken);
                 
                 if (existing == null)
                 {
                     db.UserMappings.Add(new AtcoGenie.Server.Data.UserMapping 
                     {
                         AdObjectGuid = adUser.ObjectGuid,
                         Email = adUser.Email,
                         DisplayName = adUser.DisplayName,
                         SamAccountName = adUser.SamAccountName,
                         HcmsEmployeeId = hcmsEmployee.EmployeeId,
                         IsActive = true,
                         LastSyncedAt = DateTime.UtcNow
                     });
                 }
                 else
                 {
                     // Update existing
                     existing.HcmsEmployeeId = hcmsEmployee.EmployeeId;
                     existing.AdObjectGuid = adUser.ObjectGuid;
                     existing.SamAccountName = adUser.SamAccountName;
                     existing.LastSyncedAt = DateTime.UtcNow;
                 }
            }
            
            await db.SaveChangesAsync(stoppingToken);
            _logger.LogInformation("Identity Sync completed and saved to DB.");
        }
    }

    private async Task<List<HcmsEmployee>> FetchHcmsEmployeesAsync(CancellationToken stoppingToken)
    {
        var results = new List<HcmsEmployee>();
        var connectionString = _config.GetConnectionString("HcmsConnection");

        try
        {
            using (var conn = new Microsoft.Data.SqlClient.SqlConnection(connectionString))
            {
                await conn.OpenAsync(stoppingToken);
                
                var sql = @"
SELECT DISTINCT D1.[EmpCode]
      ,D1.[Email]
  FROM [HCMS].[dbo].[tblEmployee] as D1
INNER JOIN [Security].[dbo].[UserMapping] AS D2 ON D1.EmpId = D2.EmployeeId
WHERE (D1.Active = 1 or D1.Active = 2) AND D1.[Email] IS NOT NULL AND D1.[Email] <> '';";

                using (var cmd = new Microsoft.Data.SqlClient.SqlCommand(sql, conn))
                using (var reader = await cmd.ExecuteReaderAsync(stoppingToken))
                {
                    while (await reader.ReadAsync(stoppingToken))
                    {
                        var email = reader["Email"]?.ToString();
                        var code = reader["EmpCode"]?.ToString();

                        if (!string.IsNullOrEmpty(email) && !string.IsNullOrEmpty(code))
                        {
                            results.Add(new HcmsEmployee 
                            { 
                                Email = email, 
                                EmployeeId = code 
                            });
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch HCMS Employees. Check connection string and firewall.");
        }

        return results;
    }

    private List<AdUserInfo> FetchAdUsers()
    {
        var results = new List<AdUserInfo>();
        
        // Ensure "LDAPConnection" is in appsettings.json
        var ldapPath = _config["Identity:LdapPath"] ?? "LDAP://DC=atco,DC=local"; 
        
        try 
        {
            using (var entry = new DirectoryEntry(ldapPath))
            using (var searcher = new DirectorySearcher(entry))
            {
                searcher.Filter = "(&(objectClass=user)(objectCategory=person)(!userAccountControl:1.2.840.113556.1.4.803:=2))"; 
                searcher.PageSize = 1000;
                searcher.PropertiesToLoad.Add("objectGUID");
                searcher.PropertiesToLoad.Add("mail");
                searcher.PropertiesToLoad.Add("displayName");
                searcher.PropertiesToLoad.Add("sAMAccountName");

                using (var collection = searcher.FindAll())
                {
                    foreach (SearchResult result in collection)
                    {
                        var email = GetProperty(result, "mail");
                        if (string.IsNullOrEmpty(email)) continue;

                        var guidBytes = (byte[])result.Properties["objectGUID"][0];
                        var guid = new Guid(guidBytes);

                        results.Add(new AdUserInfo
                        {
                            ObjectGuid = guid,
                            Email = email,
                            DisplayName = GetProperty(result, "displayName"),
                            SamAccountName = GetProperty(result, "sAMAccountName")
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to query Active Directory. Ensure machine is domain-joined or credentials provided.");
             // If we are strictly "Local" without AD access, fallback to mock data so the app doesn't crash during demo
             // But log error clearly
        }

        return results;
    }

    private string? GetProperty(SearchResult result, string propName)
    {
        if (result.Properties.Contains(propName))
        {
            return result.Properties[propName][0].ToString();
        }
        return null;
    }
}

public class AdUserInfo
{
    public Guid ObjectGuid { get; set; }
    public required string Email { get; set; }
    public string? DisplayName { get; set; }
    public string? SamAccountName { get; set; }
}

public class HcmsEmployee
{
    public required string Email { get; set; }
    public required string EmployeeId { get; set; }
}
