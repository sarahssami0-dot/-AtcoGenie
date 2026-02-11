using Microsoft.EntityFrameworkCore;
using AtcoGenie.Server.Domain.Entities;

namespace AtcoGenie.Server.Infrastructure.Data;

public class GenieDbContext : DbContext
{
    public GenieDbContext(DbContextOptions<GenieDbContext> options) : base(options) { }

    public DbSet<ChatSession> ChatSessions { get; set; }
    public DbSet<ChatMessage> ChatMessages { get; set; }
    public DbSet<Folder> Folders { get; set; }
    public DbSet<ChatFolderMapping> ChatFolderMappings { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Use custom schema for organization
        modelBuilder.HasDefaultSchema("genie");

        // ===== ChatSession Configuration =====
        modelBuilder.Entity<ChatSession>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Title).IsRequired().HasMaxLength(200);
            entity.Property(c => c.UserId).IsRequired().HasMaxLength(100);
            entity.Property(c => c.ModelId).HasMaxLength(50);
            
            // Index for efficient user queries
            entity.HasIndex(c => new { c.UserId, c.IsArchived });
        });

        // ===== ChatMessage Configuration =====
        modelBuilder.Entity<ChatMessage>(entity =>
        {
            entity.HasKey(m => m.Id);
            entity.Property(m => m.Sender).IsRequired().HasMaxLength(10);
            entity.Property(m => m.Content).IsRequired();
            
            entity.HasOne(m => m.ChatSession)
                .WithMany(c => c.Messages)
                .HasForeignKey(m => m.ChatSessionId)
                .OnDelete(DeleteBehavior.Cascade);
            
            // Index for chronological retrieval
            entity.HasIndex(m => new { m.ChatSessionId, m.Timestamp });
        });

        // ===== Folder Configuration =====
        modelBuilder.Entity<Folder>(entity =>
        {
            entity.HasKey(f => f.Id);
            entity.Property(f => f.Name).IsRequired().HasMaxLength(100);
            entity.Property(f => f.UserId).IsRequired().HasMaxLength(100);
            
            // Enforce unique folder names per user (case-insensitive)
            entity.HasIndex(f => new { f.UserId, f.Name })
                .IsUnique()
                .HasDatabaseName("IX_Folder_UserId_Name_Unique");
            
            // Index for sorting
            entity.HasIndex(f => new { f.UserId, f.SortOrder });
        });

        // ===== ChatFolderMapping Configuration =====
        modelBuilder.Entity<ChatFolderMapping>(entity =>
        {
            entity.HasKey(cfm => cfm.Id);
            
            // Prevent duplicate chat-folder assignments
            entity.HasIndex(cfm => new { cfm.FolderId, cfm.ChatSessionId })
                .IsUnique()
                .HasDatabaseName("IX_ChatFolderMapping_Unique");
            
            // Cascade delete when folder is deleted
            entity.HasOne(cfm => cfm.Folder)
                .WithMany(f => f.ChatMappings)
                .HasForeignKey(cfm => cfm.FolderId)
                .OnDelete(DeleteBehavior.Cascade);
            
            // Cascade delete when chat is deleted (critical for data integrity)
            entity.HasOne(cfm => cfm.ChatSession)
                .WithMany()
                .HasForeignKey(cfm => cfm.ChatSessionId)
                .OnDelete(DeleteBehavior.Cascade);
            
            // Index for folder content queries
            entity.HasIndex(cfm => new { cfm.FolderId, cfm.AddedAt });
        });
    }
}
