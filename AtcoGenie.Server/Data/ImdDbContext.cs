using Microsoft.EntityFrameworkCore;

namespace AtcoGenie.Server.Data;

public class ImdDbContext : DbContext
{
    public ImdDbContext(DbContextOptions<ImdDbContext> options) : base(options) { }

    public DbSet<UserMapping> UserMappings { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UserMapping>(entity =>
        {
            entity.ToTable("imd_usermapping");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.AdObjectGuid).HasColumnName("adobjectguid");
            entity.Property(e => e.HcmsEmployeeId).HasColumnName("hcmsemployeeid");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.DisplayName).HasColumnName("displayname");
            entity.Property(e => e.SamAccountName).HasColumnName("samaccountname");
            entity.Property(e => e.LastSyncedAt).HasColumnName("lastsyncedat");
            entity.Property(e => e.IsActive).HasColumnName("isactive");
            entity.HasIndex(e => e.Email).IsUnique();
            entity.HasIndex(e => e.AdObjectGuid).IsUnique();
        });
    }
}

public class UserMapping
{
    public int Id { get; set; }
    public Guid AdObjectGuid { get; set; }
    public required string HcmsEmployeeId { get; set; }
    public required string Email { get; set; }
    public string? DisplayName { get; set; }
    public string? SamAccountName { get; set; }
    public DateTime LastSyncedAt { get; set; }
    public bool IsActive { get; set; }
}
