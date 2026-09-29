ghūl infers most types, so local variables, the parameters of anonymous functions
and generic type arguments usually don't need a written type. Each program here
shows one kind of inference the compiler does.

A type that is left off is taken from how the value is used, before or after, whatever
holds it: a local variable, a generic type argument or a function literal's parameter.
