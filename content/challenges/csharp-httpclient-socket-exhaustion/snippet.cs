using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace Acme.Pricing.Services;

public sealed record FxQuote(string BaseCurrency, string QuoteCurrency, decimal Rate, DateTimeOffset QuotedAt);

public sealed class FxRateService(Uri providerBaseUri, ILogger<FxRateService> logger)
{
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(5);

    public async Task<FxQuote?> FetchSpotRateAsync(
        string baseCurrency,
        string quoteCurrency,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(baseCurrency) || string.IsNullOrWhiteSpace(quoteCurrency))
        {
            throw new ArgumentException("Currency codes must be non-empty.");
        }

        string pair = $"{baseCurrency.Trim().ToUpperInvariant()}/{quoteCurrency.Trim().ToUpperInvariant()}";
        Uri endpoint = new(providerBaseUri, $"/v1/rates/{pair}");

        using var client = new HttpClient
        {
            Timeout = RequestTimeout,
        };

        using HttpResponseMessage response = await client.GetAsync(endpoint, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("FX provider returned {StatusCode} for {Pair}", response.StatusCode, pair);
            return null;
        }

        FxQuote? quote = await response.Content.ReadFromJsonAsync<FxQuote>(cancellationToken);
        if (quote is null || quote.Rate <= 0m)
        {
            return null;
        }

        return quote;
    }
}
