using Microsoft.EntityFrameworkCore;

namespace Acme.Billing.Services;

public sealed record InvoiceEntity(Guid Id, string CustomerCode, string Status, decimal AmountDue, DateTimeOffset DueDate);
public sealed record InvoiceExportRow(Guid InvoiceId, string CustomerCode, decimal AmountDue, DateTimeOffset DueDate);

public sealed class BillingDbContext(DbContextOptions<BillingDbContext> options) : DbContext(options)
{
    public DbSet<InvoiceEntity> Invoices => Set<InvoiceEntity>();
}

public sealed class BillingExportService(IDbContextFactory<BillingDbContext> dbFactory)
{
    public async Task<IEnumerable<InvoiceExportRow>> GetPendingInvoicesAsync(
        string customerCode,
        DateTimeOffset cutoffDate,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(customerCode))
        {
            throw new ArgumentException("Customer code is required.", nameof(customerCode));
        }

        await using BillingDbContext db = await dbFactory.CreateDbContextAsync(cancellationToken);

        IEnumerable<InvoiceExportRow> pendingRows = db.Invoices
            .AsNoTracking()
            .Where(inv => inv.CustomerCode == customerCode
                && inv.Status == "Pending"
                && inv.DueDate <= cutoffDate)
            .OrderBy(inv => inv.DueDate)
            .Select(inv => new InvoiceExportRow(
                inv.Id,
                inv.CustomerCode,
                inv.AmountDue,
                inv.DueDate));

        return pendingRows;
    }
}
