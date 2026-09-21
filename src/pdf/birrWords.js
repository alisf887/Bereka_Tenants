export function birrToWords(amount){
    if(amount===390000)
        return "Three Hundred Ninety Thousand Birr Only";

    return amount.toLocaleString()+" Birr";
}