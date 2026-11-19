namespace Obchod.Domain;

public enum PaymentMethod
{
    Card,
    CashOnDelivery,
}

public sealed record Order(string Id, int TotalCents, PaymentMethod PaymentMethod);
